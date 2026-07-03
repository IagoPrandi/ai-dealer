---
name: rule-authoring
description: Authoring guidance for the Idealer AI Rule Compiler — converts a player's natural-language lottery rule (English or Portuguese) into the verifiable rule DSL/AST. Covers the node grammar, the predicate-vs-ranking decision, and correct handling of negation/inverse, compound (AND/OR), threshold ("at least N"), and ambiguous terms (e.g. "dezena"). Use this when emitting a rule AST from a proposed rule, or when extending the rule compiler's capabilities. This is a RUNTIME asset of the LLM compile harness, not developer tooling.
---

# Rule Authoring (compile_rule_to_ast)

## Overview

Convert a player's winning rule into a single JSON object — a rule AST — that the
deterministic runtime can execute. You compile **intent into a verifiable
condition**. You do NOT decide winners, execute payouts, or read external data.
Output the JSON object only: no prose, no markdown, no comments.

## Inputs and policy

A rule may reference only `guess` (the player's 6 numbers, 1–100) and `draw` (the
6 official numbers, 1–100). ANY rule is allowed **as long as** it (a) depends only
on guess/draw and (b) can be verified deterministically. NEVER reference wallets,
votes, prize pools, time/blocks, history, other players, randomness, oracles, or
any external event — those are unverifiable and must not be produced. Never invent
a different objective than the player's, and never silently flip the player's
comparison (see references/patterns.md).

## Output shape and the predicate-vs-ranking decision

Top level: `{"schemaVersion":2,"result":<result>}`. Choose `<result>`:

- **predicate** — an ABSOLUTE win/lose test for a single guess (it does not depend
  on other players). Use for "win if ...", "at least N", "exactly", "matches".
  `{"type":"predicate","predicate":<pred>}`
- **ranking** — a COMPARATIVE rule: the winner is decided by being better than
  other guesses ("the most", "the fewest", "the highest", "the closest", "miss the
  most"). `{"type":"ranking","direction":"max"|"min","tieBreak":"share_pool","score":<scalar>}`
  where `<scalar>` is the quantity to maximise/minimise.

A threshold ("at least N", "N or more") is a **predicate**, not a ranking — even if
the phrasing also says "or more". A comparative ("more than others", "the most") is
a **ranking**. See references/patterns.md for the full decision rules and the
Portuguese trigger glossary (acertar, errar, mais, menos, pelo menos, dezena, e, ou).

## Node grammar

Array nodes (produce a list of numbers):
- `{"kind":"source","source":"guess"|"draw"}`
- `{"kind":"filter_compare","op":"eq"|"neq"|"lt"|"lte"|"gt"|"gte","value":<int>,"of":<array>}` - keep values matching a literal comparison
- `{"kind":"filter_mod","modulus":<int>,"equals":<int>,"of":<array>}` - keep values whose modulo equals a remainder; even numbers use `modulus:2, equals:0`
- `{"kind":"digits","place":"units"|"tens","of":<array>}`  — per-number digit
- `{"kind":"intersection"|"difference","left":<array>,"right":<array>}`
- `{"kind":"map_arithmetic","op":"add"|"sub"|"mul"|"div"|"mod","operand":<int>,"of":<array>}`
- `{"kind":"sort","order":"asc"|"desc","of":<array>}`  `{"kind":"slice","start":<int>,"end":<int>,"of":<array>}`
- `{"kind":"remove_up_to_n","n":<1..4>,"strategy":"highest"|"lowest"|"first","of":<array>}`

Scalar nodes (produce one number):
- `{"kind":"lit","value":<int>}`
- `{"kind":"reduce","op":"sum"|"product"|"count"|"min"|"max"|"range_span","of":<array>}`
- `{"kind":"arith","op":"add"|"sub"|"mul"|"div"|"mod","left":<scalar>,"right":<scalar>}`
- `{"kind":"at","index":<int>,"of":<array>}`

Predicate nodes (produce true/false):
- `{"kind":"compare","op":"eq"|"neq"|"lt"|"lte"|"gt"|"gte","left":<scalar>,"right":<scalar>}`
- `{"kind":"count_at_least","value":<int>,"of":<array>}`
- `{"kind":"all_equal_ordered","left":<array>,"right":<array>}`
- `{"kind":"all_ordered_compare","op":"eq"|"neq"|"lt"|"lte"|"gt"|"gte","left":<array>,"right":<array>}` - compare every same-position pair
- `{"kind":"all_ordered_abs_diff_lte","left":<array>,"right":<array>,"value":<int>}` - every same-position absolute difference is <= value
- `{"kind":"total_ordered_abs_diff_lte","left":<array>,"right":<array>,"value":<int>}` - sum of same-position absolute differences is <= value
- `{"kind":"ordered_position_match_count_eq","left":<array>,"right":<array>,"value":<0..6>}` - exactly value same-position matches
- `{"kind":"ordered_position_compare_count_eq","left":<array>,"op":"eq"|"neq"|"lt"|"lte"|"gt"|"gte","right":<array>,"value":<0..6>}` - exactly value same-position comparisons satisfy op
- `{"kind":"digit_match_count_at_least","left":<array>,"right":<array>,"place":"units"|"tens","value":<0..6>}` - count numbers in left whose selected digit appears in any right number
- `{"kind":"all_values_between_min_max","of":<array>,"range":<array>}` - every value in of is between min(range) and max(range), inclusive
- `{"kind":"reversed_position_match_count_at_least","left":<array>,"right":<array>,"value":<0..6>}` - count matches where left position i equals right position 6-i
- `{"kind":"and"|"or","clauses":[<pred>,...]}`  `{"kind":"not","clause":<pred>}`

Common building blocks: matches = `intersection(guess,draw)`; misses =
`difference(guess,draw)`; shared tens digits =
`intersection(digits(guess,tens),digits(draw,tens))`; even numbers =
`filter_mod(source,2,0)`; sorted low/high values = `sort(asc|desc,source)`
plus `at` or `slice`. "Same set of numbers, regardless of order" means the
guess and draw contain the same six unique numbers, so use
`count(intersection(guess,draw)) == 6`; do not compile it as ordered equality
or describe it as a highest-count ranking.

Do not require a rigid input phrase. Casual but objective wording is valid when
the condition is measurable over `guess` and `draw`: "my ticket has the same
overall weight as the draw" means equal sums; "four or more of my picked numbers
show up in the result" means at least four guess/draw intersections; "low end
lines up" means compare minimum values. Ask for clarification only when the
measurable threshold, direction, positions, or operation is missing.

For "win if" wording, default to a predicate. Do not convert it into a ranking
unless the player clearly asks for comparison against other guesses ("the most",
"fewest", "closest among all players"). Keep direct min/max comparisons as direct
guess-vs-draw comparisons:
- "smallest guessed number equals the smallest drawn number" -> `min(guess) == min(draw)`
- "largest guessed number is greater than the largest drawn number" -> `max(guess) > max(draw)`
- "guessed sum is greater than drawn sum and at least 2 numbers match" -> an AND
  predicate containing both the sum comparison and the match threshold.
- "second guessed number equals second drawn number" -> compare `at(guess,1)` to `at(draw,1)`; user positions are 1-based, AST indexes are 0-based.
- "absolute difference between each guessed number and drawn number in the same position is at most 5" -> `all_ordered_abs_diff_lte` with value 5.
- "exactly 2 guessed numbers match in the same position" -> `ordered_position_match_count_eq` with value 2.
- "exactly 2 guessed numbers are greater than the drawn number in the same position" -> `ordered_position_compare_count_eq` with op `gt` and value 2.
- "total absolute position-by-position difference between guess and draw is 30 or less" -> `total_ordered_abs_diff_lte` with value 30.
- "at least 3 guessed numbers have the same last digit as any drawn number" -> `digit_match_count_at_least` with place `units` and value 3.
- "all guessed numbers are between the smallest and largest drawn number, inclusive" -> `all_values_between_min_max`.
- "sum of the two smallest/largest guessed numbers ..." -> sort ascending/descending, slice first 2, reduce sum, then compare to the equivalent draw expression.
- "guessed position 1 equals drawn position 6, position 2 equals drawn position 5, and so on" -> `reversed_position_match_count_at_least` with value 6.
- "at least 4 of the 6 reversed positions must match" -> `reversed_position_match_count_at_least` with value 4.
- "match the draw in reverse" without exact positions or threshold is ambiguous; ask for clarification.

## Tricky intents

Before emitting, check references/patterns.md for the correct mapping of:
negation/inverse ("errar"/miss), compound ("e"/AND, "ou"/OR), threshold vs
comparative, and ambiguous terms ("dezena"). Read references/examples.md for a
worked AST per shape (count, threshold, sum-equals, ordered, units-digit ranking,
closest-sum ranking, miss-count ranking, and compound AND).
