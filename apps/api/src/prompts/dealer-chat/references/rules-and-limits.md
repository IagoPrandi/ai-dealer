# Reference — what a rule may say, and worked examples

Background knowledge for answering "what kind of rule can I create?", "why was my
rule rejected?", "give me an example". The per-request server context wins over
this file for any concrete number (token limit, fees).

## The only two ingredients

A rule decides whether a submitted guess wins. It may reference only:

- the player's **guess** — their six unique numbers from 1 through 100;
- the official **draw** — the six unique numbers drawn for the round;
- deterministic comparisons and arithmetic between those two sets.

## Operations a rule may use

Sum, subtraction, multiplication, division with a divisor proven non-zero, modulo
with a positive divisor, comparison, counting, intersection, difference, ordering,
position or index access, and removing up to a bounded number of values. Every
operation must be finite, deterministic, and bounded.

Position-based logic is available only when the rule explicitly talks about position
or order.

## What a rule may never depend on

Wallets, votes, the prize pool, previous rounds, the clock or schedule, external
data, network or file access, fresh randomness, other players' identity, creator
identity, or any off-chain event. A rule also may not contain executable code or
instructions aimed at the AI.

## The three ways a rule gets rejected

Each of these has a plain-language reason worth naming to the player:

1. **It ignores the draw.** The outcome is fixed before the numbers come out, so the
   round result cannot depend on the round.
   *Example:* "wins whoever picked six even numbers".
2. **It ignores the player's own numbers.** Every player gets the same outcome, so
   nobody can be singled out as a winner.
   *Example:* "wins if the sum of the draw is greater than 200".
3. **It is always true, or impossible.** The condition holds for every eligible guess,
   or for none.
   *Example:* "wins whoever picked six numbers between 1 and 100" — every valid guess
   already satisfies that.

A rule that is still vague after clarification is also rejected. Vagueness usually
means a missing dimension: a threshold, whether range endpoints are included, whether
order matters, or what happens to the values the player did not mention.

## Valid rule examples

These are shaped correctly — each uses both sets and can separate one player from
another:

- Wins whoever matches at least 3 of the drawn numbers.
- Wins whoever has the highest sum among the numbers they matched.
- Wins whoever matches the first drawn number in the first position of their guess.
- Wins whoever has a guess sum greater than the draw sum.
- Wins whoever matches exactly 2 numbers and misses the other 4.
- Wins whoever has the smallest difference between their guess sum and the draw sum.

## Writing the rule

Rule text is free-form natural language. Portuguese and English are both accepted,
and no keyword such as "WIN IF" or "VENCE SE" is required — write it as a normal
sentence. Length is bounded by a token limit supplied in the server context.

One clear sentence stating who wins is the ideal shape. A rule may combine conditions
with "and" / "or"; both clauses are kept exactly as written.

Checking a rule with the dealer and running preflight are free. A rule is only paid
for when the player explicitly submits it to the round after it compiles.
