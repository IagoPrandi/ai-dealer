# Worked examples (intent → AST)

Each line pairs a player intent with the exact JSON AST to emit.

"win if at least 4 of your numbers are drawn" (threshold) =>
{"schemaVersion":2,"result":{"type":"predicate","predicate":{"kind":"count_at_least","value":4,"of":{"kind":"intersection","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}}}}

"win if at least 2 of your numbers are drawn" / "acertar 2 ou mais" (threshold, NOT ranking) =>
{"schemaVersion":2,"result":{"type":"predicate","predicate":{"kind":"count_at_least","value":2,"of":{"kind":"intersection","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}}}}

"win if the sum of your numbers equals the sum of the drawn numbers" =>
{"schemaVersion":2,"result":{"type":"predicate","predicate":{"kind":"compare","op":"eq","left":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"guess"}},"right":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"draw"}}}}}

"win if your exact sequence matches the draw in order" =>
{"schemaVersion":2,"result":{"type":"predicate","predicate":{"kind":"all_equal_ordered","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}}}

"whoever matches the most numbers" / "acertar mais números" (ranking max) =>
{"schemaVersion":2,"result":{"type":"ranking","direction":"max","tieBreak":"share_pool","score":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}}}}

"whoever misses the most numbers" / "errar mais números" (ranking max over misses) =>
{"schemaVersion":2,"result":{"type":"ranking","direction":"max","tieBreak":"share_pool","score":{"kind":"reduce","op":"count","of":{"kind":"difference","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}}}}

"whoever matches the most units digits" =>
{"schemaVersion":2,"result":{"type":"ranking","direction":"max","tieBreak":"share_pool","score":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"digits","place":"units","of":{"kind":"source","source":"guess"}},"right":{"kind":"digits","place":"units","of":{"kind":"source","source":"draw"}}}}}}

"whoever's guessed sum is closest to the drawn sum" (ranking min over the difference) =>
{"schemaVersion":2,"result":{"type":"ranking","direction":"min","tieBreak":"share_pool","score":{"kind":"arith","op":"sub","left":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"guess"}},"right":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"draw"}}}}}

"win if you match at least one number AND at least one tens digit" / "acertar 1 número e 1 dezena" (compound — keep BOTH clauses) =>
{"schemaVersion":2,"result":{"type":"predicate","predicate":{"kind":"and","clauses":[{"kind":"count_at_least","value":1,"of":{"kind":"intersection","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}},{"kind":"count_at_least","value":1,"of":{"kind":"intersection","left":{"kind":"digits","place":"tens","of":{"kind":"source","source":"guess"}},"right":{"kind":"digits","place":"tens","of":{"kind":"source","source":"draw"}}}}]}}}
