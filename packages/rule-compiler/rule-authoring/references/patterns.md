# Rule intent patterns (read before emitting the AST)

Small models frequently mis-handle four intent shapes. Apply these rules exactly.

## 1. Negation / inverse — never flip polarity

- "miss / wrong / not drawn / errar / errou / fora" = numbers in the guess that do
  NOT appear in the draw → `difference(guess,draw)` (count with `reduce count`).
- "more / most / mais / maior" = MAXIMISE → ranking `direction:"max"`.
- "fewer / least / menos / menor" = MINIMISE → ranking `direction:"min"`.
- NEVER rewrite "miss the most" as "fewest correct" or vice-versa. Keep the
  player's quantity and direction exactly.

Examples:
- "ganhar quem errar mais números" = whoever MISSES the MOST → ranking, max,
  score = `count(difference(guess,draw))`.
- "ganhar quem acertar mais números" = whoever MATCHES the MOST → ranking, max,
  score = `count(intersection(guess,draw))`.

## 2. Threshold vs comparative

- "at least N / N or more / pelo menos N / N ou mais / no mínimo N" is an
  ABSOLUTE threshold → predicate `count_at_least` with `value:N`. It is NOT a
  ranking, even when the phrasing also says "or more".
- "the most / more than the others / o que mais / quem mais" is a comparison
  BETWEEN players → ranking.
- Mixed phrasings like "acertar 2 ou mais" mean the threshold N=2 (predicate
  `count_at_least value:2`). Do not collapse it into a ranking — that would drop
  the floor and let a 1-match guess win.

## 3. Compound rules — keep every clause

- "A and B / A e B" → `{"kind":"and","clauses":[<A>,<B>]}`.
- "A or B / A ou B" → `{"kind":"or","clauses":[<A>,<B>]}`.
- Never drop a clause. If one side is a comparative ("the most") and the other an
  absolute test, the rule cannot be a single predicate AND a ranking — prefer the
  absolute interpretation (a threshold) so the rule stays a verifiable predicate,
  unless the player clearly wants pure ranking.

## 4. Ambiguous terms — "dezena"

"dezena" has two common meanings in Portuguese lottery language:
- a drawn NUMBER (Mega-Sena sense): "acertar uma dezena" = match one drawn number
  → `count_at_least(1, intersection(guess,draw))`.
- the TENS DIGIT of a number: → use `digits(...,"tens")`.

When the surrounding text does not make the intent clear, DEFAULT to the
drawn-number meaning (the dominant lottery usage) and proceed. Only treat it as the
tens digit when the player explicitly says "digit / dígito / casa das dezenas".

## Portuguese trigger glossary

| Portuguese | Meaning | Maps to |
| --- | --- | --- |
| acertar / acerto | match a drawn number | `intersection(guess,draw)` |
| errar / errou / fora | not in the draw (a miss) | `difference(guess,draw)` |
| mais / maior / máximo | most / maximise | ranking `direction:"max"` |
| menos / menor / mínimo | fewest / minimise | ranking `direction:"min"` |
| pelo menos N / N ou mais | threshold ≥ N | predicate `count_at_least value:N` |
| exatamente N | exactly N | `compare(reduce count(intersection), eq, N)` |
| soma | sum | `reduce op:"sum"` |
| dezena | a drawn number (default) or tens digit | see section 4 |
| unidade / dígito da unidade | units digit | `digits(...,"units")` |
| e | and | `and` |
| ou | or | `or` |
| mais perto / mais próximo | closest | ranking min over `arith sub` |
