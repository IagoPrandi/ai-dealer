# Objective semantics reference

Use these mappings when the named information is explicit. Do not use them to fill a missing threshold, direction, boundary, or positional relation.

`'win if' means an absolute predicate` for each guess unless an explicit comparative ranking is present. Preserve the player's invariants across `quantity/comparator, property being compared, positional/order relation, and polarity/direction`. When clarifying, never offer stock examples, generic match-count rules, or arbitrary replacement thresholds.

| Player wording                               | Objective meaning                                                            | Micro-example                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `win if`                                     | Absolute predicate for each guess                                            | `Win if min(guess) == min(draw)` is not a competition; `max(guess) > max(draw)` is also direct. |
| `most matches wins`                          | Rank by `count(guess intersection draw)`, highest first                      | `Whoever guesses more numbers wins` is a valid ranking.                                         |
| `fewest matches wins`                        | Rank by match count, lowest first                                            | Do not flip `fewest` to `most`.                                                                 |
| `at least N matches`                         | Fixed match-count threshold                                                  | `Four or more picks appear` means count >= 4.                                                   |
| `smallest/largest`                           | Direct min/max comparison between guess and draw                             | `largest guess > largest draw`.                                                                 |
| `same set, any order`                        | All six guessed values appear in the draw                                    | Intersection count equals six.                                                                  |
| `same position`                              | Compare one-based user positions pairwise                                    | `second guess = second draw`.                                                                   |
| `exactly N same-position matches`            | Count indices where values are equal                                         | Exactly 2 guessed numbers match their drawn positions.                                          |
| `exactly N positions are greater`            | Count indices satisfying the comparator                                      | Exactly two `guess[i] > draw[i]`.                                                               |
| `each position within N`                     | Every pair has absolute difference <= N                                      | Six pairwise comparisons.                                                                       |
| `total position difference`                  | Sum all pairwise absolute differences                                        | Total <= 30.                                                                                    |
| `reverse order` with explicit mapping        | Compare position 1 to 6, 2 to 5, and so on                                   | All six or a named threshold.                                                                   |
| bare `match in reverse`                      | Ambiguous threshold                                                          | Ask whether all six or at least N must match.                                                   |
| `same tens range` in corresponding positions | Compare integer division by ten pairwise                                     | 12 and 11 share tens range 10.                                                                  |
| `dezena` without context                     | Ambiguous number versus tens digit                                           | Ask which meaning is intended.                                                                  |
| `same units/last digit`                      | Compare values modulo 10                                                     | 12 and 32 have the same last digit.                                                             |
| `same tens digit`                            | Compare floor(value / 10)                                                    | 31 and 39 share tens digit 3.                                                                   |
| `same parity`                                | Compare values modulo 2                                                      | Odd/even position by position.                                                                  |
| `same number of evens`                       | Compare filtered counts                                                      | Count even values in each array.                                                                |
| `odd-number sums`                            | Filter odd values, then compare sums                                         | Keep filter and sum operations.                                                                 |
| `multiples of N count`                       | Filter by modulus, then count                                                | Compare multiples-of-five counts.                                                               |
| `sum equals`                                 | Compare `sum(guess)` with `sum(draw)`                                        | No ranking is implied.                                                                          |
| `sum modulo N`                               | Compare remainders after summing                                             | Last digit of totals means modulo 10.                                                           |
| `within N of any drawn number`               | For each guess value, compare with every draw value                          | Not a same-position comparison.                                                                 |
| `between min(draw) and max(draw)`            | Every named value is inside inclusive draw bounds when inclusive is explicit | Preserve both bounds.                                                                           |
| `two smallest/largest`                       | Sort, slice two values, then sum                                             | Compare low-pair or high-pair sums.                                                             |
| `first/last three sum`                       | Slice positions before summing                                               | First three means indices 0 through 2.                                                          |
| `drop highest/lowest N`                      | Bounded removal using the named strategy                                     | Remove up to two lowest picks.                                                                  |
| `map value and keep in 1-100`                | Apply mapping with a range guard                                             | Double picks, discard results outside the domain.                                               |
| explicit `A and B` / `A or B`                | Preserve both clauses and connector                                          | Never compile only the easier clause.                                                           |
| guess ignored                                | Shared outcome for all eligible guesses                                      | Requires confirmation unless explicit.                                                          |
| draw ignored                                 | Outcome fixed before draw                                                    | Requires confirmation unless explicit.                                                          |

Casual, terse, informal, or ungrammatical wording is not ambiguity when its measurable property, comparator, threshold, and relation are all present.

A bare request to `match the draw in reverse` requires clarification. A same-order example such as `draw 12 31 24 versus guess 11 30 29`, explained as 10 30 20, means corresponding tens ranges rather than full-number equality.
