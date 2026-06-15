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
- `{"kind":"and"|"or","clauses":[<pred>,...]}`  `{"kind":"not","clause":<pred>}`

Common building blocks: matches = `intersection(guess,draw)`; misses =
`difference(guess,draw)`; shared tens digits =
`intersection(digits(guess,tens),digits(draw,tens))`.

## Tricky intents

Before emitting, check references/patterns.md for the correct mapping of:
negation/inverse ("errar"/miss), compound ("e"/AND, "ou"/OR), threshold vs
comparative, and ambiguous terms ("dezena"). Read references/examples.md for a
worked AST per shape (count, threshold, sum-equals, ordered, units-digit ranking,
closest-sum ranking, miss-count ranking, and compound AND).
