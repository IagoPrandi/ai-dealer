---
name: rule-authoring
description: Authoring guidance for the Tyche AI Rule Compiler — converts a player's natural-language lottery rule (English or Portuguese) into the verifiable rule DSL/AST (schemaVersion 3 compositional core). Covers the core node grammar, binder scopes, the predicate-vs-ranking decision, the macro cookbook for common intents, and correct handling of negation/inverse, compound (AND/OR), threshold ("at least N"), and ambiguous terms (e.g. "dezena"). Use this when emitting a rule AST from a proposed rule, or when extending the rule compiler's capabilities. This is a RUNTIME asset of the LLM compile harness, not developer tooling.
---

# Rule Authoring (compile_rule_to_ast)

## Overview

Convert a player's winning rule into a single auditable JSON compilation candidate
that contains a rule AST, the exact source spans consumed by that AST, and worked
examples derived from the player's wording. You compile **intent into a verifiable
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

The top-level response is:

`{"ast":<rule-ast>,"consumedSpans":[{"text":<exact-source-substring>}],"workedExamples":[<examples>]}`

- `consumedSpans` must quote exact substrings from the normalized input. Together
  they must cover every intent-bearing condition. Report the smallest complete
  condition span(s) actually used; never claim text that the AST did not compile.
  A range such as "strictly greater than 10 and strictly less than 90" may be one
  span even when represented by one quantified AST condition. A compound rule
  with two independent conditions needs coverage for both.
- For a predicate, `workedExamples` must contain at least one `WIN` and one `LOSE`:
  `{"guess":[six unique 1-100 numbers],"draw":[six unique 1-100 numbers],"outcome":"WIN"|"LOSE"}`.
  Derive the expected outcomes from the player's text before checking the AST.
  Include boundary cases for signed differences (for "at least 10 lower", test
  exactly 10 lower and only 9 lower).
- For a ranking, provide at least two examples with the exact numeric `score`
  instead of `outcome`.

The validator rejects missing/unconsumed text and executes every example against
the AST. Do not generate examples by merely evaluating the AST: their purpose is
to provide an independent oracle for the source intent.

Every example is also checked for shape before it is executed: each `guess` and
each `draw` must be six DISTINCT numbers in 1-100. A repeated number (e.g.
`[2,2,3,4,5,6]`) invalidates the whole candidate, however correct the AST is.
Emit the JSON object and nothing after it — no trailing text and no extra
brackets.

The `ast` value is `{"schemaVersion":3,"result":<result>}`. Choose `<result>`:

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

## Core node grammar (schemaVersion 3)

The grammar is a SMALL COMPOSITIONAL CORE. There are no specialized predicate
kinds: every rule — including novel ones — is expressed by COMPOSING these nodes.

Array nodes (produce a list of numbers):
- `{"kind":"source","source":"guess"|"draw"}`
- `{"kind":"sort","order":"asc"|"desc","of":<array>}`
- `{"kind":"reverse","of":<array>}`
- `{"kind":"slice","start":<int>,"end":<int?>,"of":<array>}` — JS slice; negative `end` counts from the end
- `{"kind":"distinct","of":<array>}` — drop duplicate values, keep first occurrences
- `{"kind":"intersection"|"difference","left":<array>,"right":<array>}` — unique values, left order
- `{"kind":"digits","place":"units"|"tens","of":<array>}` — per-number digit
- `{"kind":"map","of":<array>,"expr":<scalar>}` — transform each element; `expr` sees the element as `{"kind":"elem"}`
- `{"kind":"filter","of":<array>,"where":<pred>}` — keep elements where the predicate holds; `where` sees `{"kind":"elem"}`
- `{"kind":"pairs_map","left":<array>,"right":<array>,"expr":<scalar>}` — zip both arrays position by position (length = shorter side); `expr` sees `{"kind":"pair","side":"left"|"right"}`

Scalar nodes (produce one number):
- `{"kind":"lit","value":<int>}`
- `{"kind":"reduce","op":"sum"|"product"|"count"|"min"|"max"|"range_span","of":<array>}`
- `{"kind":"at","index":<int>,"of":<array>}` — 0-based; ONLY on arrays whose length is statically known (source/sort/reverse/slice/map/digits chains). After filter/intersection/difference/distinct use `sort`+`slice`+`reduce` instead.
- `{"kind":"arith","op":"add"|"sub"|"mul"|"div"|"mod","left":<scalar>,"right":<scalar>}`
- `{"kind":"abs","of":<scalar>}`
- `{"kind":"ite","if":<pred>,"then":<scalar>,"else":<scalar>}` — conditional value (use for counting: then 1 else 0)
- `{"kind":"elem"}` / `{"kind":"elem","up":1}` — the current element of the nearest (`up:1`: the outer) map/filter/forall/exists binder
- `{"kind":"pair","side":"left"|"right"}` — the current pair inside pairs_map/pairs_forall/pairs_exists

Predicate nodes (produce true/false):
- `{"kind":"compare","op":"eq"|"neq"|"lt"|"lte"|"gt"|"gte","left":<scalar>,"right":<scalar>}`
- `{"kind":"contains","array":<array>,"value":<scalar>}`
- `{"kind":"forall"|"exists","of":<array>,"where":<pred>}` — quantify over elements; `where` sees `{"kind":"elem"}`
- `{"kind":"pairs_forall"|"pairs_exists","left":<array>,"right":<array>,"where":<pred>}` — quantify over same-position pairs
- `{"kind":"and"|"or","clauses":[<pred>,...]}`  `{"kind":"not","clause":<pred>}`
  Hard limit: **at most 10 clauses in a single `and`/`or`**. When one condition
  covers a LIST of values, nest that list in its own `and`/`or` and give the
  parent a single clause for it — flattening every value into the top level burns
  the budget and the whole rule is rejected. A rule naming a set on both sides
  must therefore be `and(<set over guess>, <negated set over draw>)`, not one
  clause per number.

Binder scopes: `map`/`filter`/`forall`/`exists` bind one element; `pairs_*` bind a
pair. Nesting is capped at 2 binders. Inside a nested binder, `{"kind":"elem","up":1}`
refers to the OUTER element (cross-array quantification: "for each of my picks,
does any drawn number ...").

Total-algebra identities (defined, deterministic — never errors): `sum`/`count` of
an empty array = 0, `product` of empty = 1, `min`/`max`/`range_span` of empty = 0,
`x div 0` = 0, `x mod m` = 0 for m ≤ 0. Division is integer (truncated).

## Macro cookbook — common intents as compositions

The JSON snippets in this document and in `references/examples.md` show only the
value of the top-level `ast` field. Always wrap that value in the auditable output
shape above.

Building blocks: matches = `intersection(guess,draw)`; misses =
`difference(guess,draw)`; even numbers = `filter(src, elem mod 2 == 0)`; count of
X = `reduce count`; "N smallest/largest" = `sort` + `slice`.

- "at least N of my numbers appear in the draw" -> `compare(count(intersection(guess,draw)), gte, N)`.
- "exactly N match" -> same with `eq`. "none appear" -> `eq 0`.
- "same set of numbers, regardless of order" -> `count(intersection(guess,draw)) == 6`; never ordered equality or a ranking.
- "sums are equal" -> `compare(sum(guess), eq, sum(draw))`.
- "all six match in the same positions" -> `pairs_forall(guess, draw, pair.left == pair.right)`.
- "all six are in the same tens range in corresponding positions" ->
  `pairs_forall(guess, draw, pair.left div 10 == pair.right div 10)`. This is a
  tens-RANGE comparison (12 and 11 both map to 1), not full-number equality,
  unordered digit matching, or the isolated tens digit (`100 div 10 == 10`).
- "every pick is below the drawn number in the same position" -> `pairs_forall(guess, draw, left lt right)`.
- "each pick within 5 of the same-position drawn number" -> `pairs_forall(guess, draw, abs(left - right) <= 5)`.
- "at least/exactly N same-position matches" -> count with a pairwise 0/1 map:
  `compare(sum(pairs_map(guess, draw, ite(left == right, 1, 0))), gte|eq, N)`.
- "exactly N picks greater than the same-position drawn number" -> same shape with `gt` inside the `ite`.
- "total position-by-position absolute difference <= T" -> `compare(sum(pairs_map(guess, draw, abs(left - right))), lte, T)`.
- "N picks within D of ANY drawn number" (any-draw closeness, not same-position) ->
  `compare(count(filter(guess, exists(draw, abs(elem(up:1) - elem) <= D))), gte, N)`.
- "at least N picks share the units/last digit with any drawn number" ->
  `compare(count(filter(digits(guess,units), contains(digits(draw,units), elem))), gte, N)`.
- "all picks between the smallest and largest drawn number, inclusive" ->
  `forall(guess, elem >= min(draw) AND elem <= max(draw))`.
- "reverse match: position 1 vs 6, 2 vs 5, and so on" -> pair with the reversed draw:
  all six = `pairs_forall(guess, reverse(draw), left == right)`; "at least 4 of the
  reversed positions" = `compare(sum(pairs_map(guess, reverse(draw), ite(left == right, 1, 0))), gte, 4)`.
- "same count of even numbers" -> `compare(count(filter(guess, elem mod 2 == 0)), eq, count(filter(draw, elem mod 2 == 0)))`.
- "the below-50 split: ticket and draw have the same count under 50" -> `compare(count(filter(guess, elem lt 50)), eq, count(filter(draw, elem lt 50)))`.
- "sum of the two smallest/largest ..." -> `sum(slice(sort(src, asc|desc), 0, 2))`, then compare both sides.
- "ignore my highest pick, the rest totals the draw" -> `compare(sum(slice(sort(guess,asc), 0, -1)), eq, sum(draw))`.
- "drop up to two lowest picks, then still have three numbers in the draw" ->
  `compare(count(intersection(slice(sort(guess,asc), 2), draw)), gte, 3)`.
- "if doubling each pick stays within 1 to 100, at least three doubled values are drawn" ->
  `compare(count(intersection(filter(map(guess, elem * 2), elem >= 1 AND elem <= 100), draw)), gte, 3)`.
- "first/last three picks sum to the first/last three drawn numbers" -> compare sums of `slice(src, 0, 3)` / `slice(src, 3)`.
- "ticket sum modulo 10 equals draw sum modulo 10" -> `compare(sum(guess) mod 10, eq, sum(draw) mod 10)`.
- positions are 1-based in user language, 0-based in the AST: "second pick equals second drawn number" -> `at(guess,1) == at(draw,1)`.
- min/max stay direct comparisons: "smallest pick equals smallest drawn" -> `min(guess) == min(draw)`; "largest pick beats largest drawn" -> `max(guess) > max(draw)`.

### Numbers the player named

A rule may compare a side against SPECIFIC numbers the player listed, not only
against the other side. Those numbers ARE the rule: every one of them must appear
as a `lit` in the AST, and a compile that keeps the shape but loses the values
freezes a different rule.

- "I win with exactly 1 2 3 4 5 6, in that order" (ordered literal sequence) ->
  `and(at(guess,0) == 1, at(guess,1) == 2, ..., at(guess,5) == 6)`. Use `at` per
  position; `pairs_forall` cannot be used, because there is no second array.
- "the first four guessed numbers are 1 2 3 4 in order; the final two do not
  matter" (ordered literal prefix) -> `and(at(guess,0) == 1, ...,
  at(guess,3) == 4)`. Do not add clauses for the explicitly free positions, and
  do not require the official draw; the standard ticket domain and uniqueness
  constraints still apply to all six values.
- "my ticket must be exactly 1 2 3 4 5 6, in any order" (unordered literal set) ->
  `and(contains(guess,1), contains(guess,2), ..., contains(guess,6))`.
- "my ticket must include 7 and 13" -> `and(contains(guess,7), contains(guess,13))`.
- "the draw contains NONE of 1 2 3 4" / "nenhum dos numeros 1 2 3 4 e sorteado"
  (negated unordered set) -> group the whole set under ONE `not(or(...))`:
  `not(or(contains(draw,1), contains(draw,2), contains(draw,3), contains(draw,4)))`.
  Do NOT emit one `not(contains(...))` per value at the top level: that is the
  same rule, but it spends one top-level clause per number and overflows the
  clause budget as soon as the other side also names a set.
- "the draw must NOT be 1 2 3 4 5 6 in that order" -> wrap the ordered form in
  `not`: `not(and(at(draw,0) == 1, ..., at(draw,5) == 6))`. Do not rewrite this as
  "the guess differs from the draw" — a literal sequence and the other side are
  different comparisons.
- the same wording may name both sides: "wins with exactly 1 2 3 4 5 6 in that
  order, and only when the draw is not that same sequence" is an `and` of the two
  clauses above, one over `guess` and one negated over `draw`.

## Novel-composition idioms (when no cookbook entry fits)

- **Counted pairs**: to COUNT how many positions satisfy a per-pair condition, map
  pairs to 0/1 with `ite` and `sum` the result.
- **Shifted zip** (relate NEIGHBORS inside one array): zip a sorted array against
  itself shifted by one — `pairs_*` with `left: slice(sorted, 0, -1)` and
  `right: slice(sorted, 1)`. "two of my picks are consecutive" ->
  `pairs_exists(..., right - left == 1)`; "no two picks within 5 of each other" ->
  `pairs_forall(..., right - left >= 5)`.
- **Digit aggregation**: `digits` yields an array — reduce or compare it like any
  other array ("units digits of my ticket sum to more than the draw's" ->
  `compare(sum(digits(guess,units)), gt, sum(digits(draw,units)))`).
- **Halves / zones**: `slice` the source, then filter/count each part ("more even
  numbers in my first half than my second half").
- **Cross-array quantification**: nest `exists` inside `forall`/`filter` and reach
  the outer element with `elem(up:1)`.

Do not require a rigid input phrase. Casual but objective wording is valid when
the condition is measurable over `guess` and `draw`: "my ticket has the same
overall weight as the draw" means equal sums; "four or more of my picked numbers
show up in the result" means at least four guess/draw intersections; "low end
lines up" means compare minimum values. Ask for clarification only when the
measurable threshold, direction, positions, or operation is missing. "Match the
draw in reverse" without exact positions or a threshold is ambiguous; ask.

For "win if" wording, default to a predicate. Do not convert it into a ranking
unless the player clearly asks for comparison against other guesses ("the most",
"fewest", "closest among all players").

When clarification is necessary, preserve four intent dimensions independently:
quantity/comparator, compared property, positional/order relation, and
polarity/direction. Vary only a dimension the player left ambiguous. Never
replace the rule with a stock match-count example or invent a threshold. If no
complete intent-preserving rewrite is possible, ask a focused question and emit
no suggested rewrite.

## Tricky intents

Before emitting, check references/patterns.md for the correct mapping of:
negation/inverse ("errar"/miss), compound ("e"/AND, "ou"/OR), threshold vs
comparative, and ambiguous terms ("dezena"). Read references/examples.md for a
worked AST per shape (count, threshold, sum-equals, ordered, pairwise counts,
digit rules, rankings, compound AND, and the novel-composition idioms).
