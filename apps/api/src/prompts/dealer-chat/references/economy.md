# Reference — prizes, fees and token economy

Background knowledge for answering questions about prizes, costs, rewards and
tokenomics. **Every concrete rate, fee and threshold is supplied in the per-request
server context — quote those values, not remembered ones.** This file explains how
the pieces relate.

## Where the prize pool comes from

The round's prize pool is formed from the fees players pay in that round: guess
submissions, rule proposals, paid rule removals, and votes. A protocol treasury
share is taken out first; the rest is the playable pool.

## How the prize pool is split

The playable pool is divided in two equal halves:

- half for winners under the **original** condition;
- half for winners under the **active alternative** condition.

Within a half, the payout is the half divided by the number of winners in it.

A half can therefore have many winners at once, and it always pays all of them.
There is no lottery-style step that picks one winner out of the several who
qualified: extra winners shrink each payout, never each player's chance of being
paid. Whether other players' guesses can change *who* wins at all depends only on
the wording of the active rule — a threshold rule ("matched at least three")
judges each guess alone, while a superlative rule ("the highest matched sum")
compares them by its own text.

If a half has no winner — nobody matched, no alternative rule was active, or the
elected rule was invalidated — that half **rolls over** into the same category of the
next round instead of being redistributed. Rounding remainders and payouts below the
minimum claim threshold roll over the same way. So a pool with no winner is never
lost; it grows the next round.

## Fees and why they escalate

The first action of each kind is free during an opening window of rounds, configured
per environment. After that, and for every repeat within the same round, the fee
doubles: the *n*-th repeat of the same action by the same wallet costs the base fee
multiplied by two to the power of *n*.

Repeats are counted per scope: guesses, rule proposals, and votes on the same rule
and the same side each escalate on their own counter. The counter resets each round.

The point is to keep a single wallet from cheaply flooding the round while leaving
genuine repeat play open to anyone willing to pay for it.

Talking to the dealer and running preflight on a rule are always free. Reporting a
rule is free but rate-limited.

## Creator and voter rewards

When the active alternative rule produces at least one winner:

- its **creator** receives a reward equal to a defined share of **one individual**
  alternative-rule winner payout;
- the wallets that voted **in favour** of that elected rule share a reward pool equal
  to the same share of one individual payout, split equally among unique voter wallets.

Both are a share of a single winner's payout, not of the whole pool, so they do not
scale with the number of winners. Repeated in-favour votes by the same wallet do not
add extra shares, and elimination votes never qualify.

These rewards are funded from a separate campaign reserve sourced from platform
monetization. They **never** reduce what a winner is paid. Both are subject to a
per-round cap and to the reserve having funds.

## Token rewards, kept separate

Tyche is a fixed-supply SPL token. Native SOL remains the prize and fee currency;
the token governs campaign rewards, locking, and treasury-fee claims.

There are three distinct reward paths, and they must never be blended:

1. **Action rewards.** While the promotion campaign has funds, a confirmed on-chain
   rule proposal or in-favour vote may earn a fixed token reward. This path does
   **not** require the rule to be elected, active, or to produce winners.
2. **Active-rule rewards.** The creator and voter rewards described above, paid in
   tokens from the campaign reserve. These *do* require an active rule with a winner.
3. **Referral rewards.** Paid only after a referred player completes a first
   confirmed guess.

No campaign reward is automatic or guaranteed: each needs its own eligibility met and
campaign funds remaining. When the reserve is exhausted the game action still works,
it simply carries no token reward.

## Treasury-fee distribution

The defined treasury-fee share of paid game actions goes to a distribution vault and
is paid out in SOL to players who **lock** their tokens in the protocol escrow.
Merely holding tokens does not qualify — the tokens must be locked.

After an accounting epoch of seven rounds closes, each eligible locked position gets
a share proportional to how many tokens were locked and how long they stayed locked
during that epoch. Prize-pool money is a separate pot and is never used for this.

## What not to say

Never promise a guaranteed or automatic payment. Never describe a token reward as a
prize-pool payment or as a treasury-fee distribution — name the actual source. Never
speculate about the token's price or market value, and never give financial advice.
