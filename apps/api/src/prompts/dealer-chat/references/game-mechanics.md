# Reference — Tywish game mechanics

Background knowledge for answering player questions about how the game works.
The per-request server context always wins over this file when the two disagree;
this file supplies the concepts, the context supplies this deployment's numbers.

## The round

A round (in Portuguese, *rodada*) is the atomic unit of the game. Every round has
its own draw, its own prize pool, and its own chance to elect an alternative rule.
Rounds are independent: nothing carries over except unclaimed prize money.

A production round lasts about 24 hours and has two player-facing phases:

- **Phase 1 — create & play (~22h).** Players submit their six numbers, propose
  alternative rules, and cast in-favour votes on other players' rules.
- **Phase 2 — shortlist & draw (~2h).** A shortlist of finalist rules is published.
  Players spend this phase voting finalists out. The phase closes at the round end.

Between the two phases the eligible rule pool is locked and the finalist-selection
draw runs. After phase 2 closes, the active rule is elected from the survivors and
the official number draw fires. That last stage is settlement, not a timed phase.

Test environments compress these durations but keep the same shape.

## Picking numbers

A player submits a **guess**: six unique numbers from 1 through 100. A wallet may
submit more than one guess in a round, each with its own numbers and its own fee.
Guesses close at the end of phase 1, before any rule is elected.

## The two ways to win

Every round evaluates up to two independent winning conditions:

- **Original condition** — match all six drawn numbers in the exact drawn order.
- **Alternative condition** — the community-elected rule for that round, evaluated
  by a deterministic engine.

They are evaluated independently. A guess can win through the alternative condition
without matching the original one, and a guess can win both.

The player does not have to predict or guess the rule. The rule only changes *how*
their submitted numbers can win.

## How a rule becomes the round's active rule

1. Any player with a valid current-round game token may propose a rule in plain
   language. Proposing costs a fee; checking the rule with the dealer is free.
2. Other players cast in-favour votes on proposed rules during phase 1.
3. When phase 1 closes, a shortlist of **10 finalists** is formed: the **3 most-voted**
   eligible rules plus **7 chosen at random** by verifiable randomness. If fewer than
   10 eligible rules exist, all of them become finalists.
4. During the whole of phase 2, players may cast elimination votes against finalists.
   A finalist is eliminated when its elimination votes exceed its frozen in-favour
   votes. **At most 5** finalists can be eliminated.
5. After phase 2 closes, one **active rule** is drawn at random from the survivors.
   That rule is the round's alternative winning condition, and it is frozen before
   the number draw.

A rule that is not elected still counted: its proposal and its in-favour votes may
still qualify for campaign token rewards.

## Fairness of the draw

Both the number draw and the random rule selections use a verifiable random function
(Switchboard on Solana). The randomness is published on-chain and anyone can verify
it. The result is computed, never decided by the dealer or by any operator.

The active rule is frozen before the numbers are drawn, so the rule can never be
chosen to fit a known result.

## What the dealer can and cannot do

The dealer interprets and explains rules and answers questions. It never decides who
wins. A deterministic engine evaluates every eligible guess against the frozen rule.
A chat answer can never make a rule valid, compile it, or authorize a payment.
