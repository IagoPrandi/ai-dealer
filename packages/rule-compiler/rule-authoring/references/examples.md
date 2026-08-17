# Worked examples (intent → AST)

Each line pairs a player intent with the exact JSON AST to emit (schemaVersion 3
compositional core).

"win if at least 4 of your numbers are drawn" (threshold) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"gte","left":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}},"right":{"kind":"lit","value":4}}}}

"win if at least 2 of your numbers are drawn" / "acertar 2 ou mais" (threshold, NOT ranking) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"gte","left":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}},"right":{"kind":"lit","value":2}}}}

"win if the sum of your numbers equals the sum of the drawn numbers" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"eq","left":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"guess"}},"right":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"draw"}}}}}

"win if exactly 3 guessed numbers appear in the draw" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"eq","left":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}},"right":{"kind":"lit","value":3}}}}

"win if no guessed number appears in the draw" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"eq","left":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}},"right":{"kind":"lit","value":0}}}}

"win if your exact sequence matches the draw in order" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"pairs_forall","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"},"where":{"kind":"compare","op":"eq","left":{"kind":"pair","side":"left"},"right":{"kind":"pair","side":"right"}}}}}

"win if my ticket is exactly 1 2 3 4 5 6 in that order" (ordered LITERAL sequence — `at` per position, every value kept) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"and","clauses":[{"kind":"compare","op":"eq","left":{"kind":"at","index":0,"of":{"kind":"source","source":"guess"}},"right":{"kind":"lit","value":1}},{"kind":"compare","op":"eq","left":{"kind":"at","index":1,"of":{"kind":"source","source":"guess"}},"right":{"kind":"lit","value":2}},{"kind":"compare","op":"eq","left":{"kind":"at","index":2,"of":{"kind":"source","source":"guess"}},"right":{"kind":"lit","value":3}},{"kind":"compare","op":"eq","left":{"kind":"at","index":3,"of":{"kind":"source","source":"guess"}},"right":{"kind":"lit","value":4}},{"kind":"compare","op":"eq","left":{"kind":"at","index":4,"of":{"kind":"source","source":"guess"}},"right":{"kind":"lit","value":5}},{"kind":"compare","op":"eq","left":{"kind":"at","index":5,"of":{"kind":"source","source":"guess"}},"right":{"kind":"lit","value":6}}]}}}

"win with 1 2 3 4 5 6 in that order, but only if the draw is not that same sequence" / "vence quem jogar 1 2 3 4 5 6 e o sorteio for diferente de 1 2 3 4 5 6, nessa ordem" (literal sequence on both sides, the draw clause negated) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"and","clauses":[{"kind":"and","clauses":[{"kind":"compare","op":"eq","left":{"kind":"at","index":0,"of":{"kind":"source","source":"guess"}},"right":{"kind":"lit","value":1}},{"kind":"compare","op":"eq","left":{"kind":"at","index":1,"of":{"kind":"source","source":"guess"}},"right":{"kind":"lit","value":2}},{"kind":"compare","op":"eq","left":{"kind":"at","index":2,"of":{"kind":"source","source":"guess"}},"right":{"kind":"lit","value":3}},{"kind":"compare","op":"eq","left":{"kind":"at","index":3,"of":{"kind":"source","source":"guess"}},"right":{"kind":"lit","value":4}},{"kind":"compare","op":"eq","left":{"kind":"at","index":4,"of":{"kind":"source","source":"guess"}},"right":{"kind":"lit","value":5}},{"kind":"compare","op":"eq","left":{"kind":"at","index":5,"of":{"kind":"source","source":"guess"}},"right":{"kind":"lit","value":6}}]},{"kind":"not","clause":{"kind":"and","clauses":[{"kind":"compare","op":"eq","left":{"kind":"at","index":0,"of":{"kind":"source","source":"draw"}},"right":{"kind":"lit","value":1}},{"kind":"compare","op":"eq","left":{"kind":"at","index":1,"of":{"kind":"source","source":"draw"}},"right":{"kind":"lit","value":2}},{"kind":"compare","op":"eq","left":{"kind":"at","index":2,"of":{"kind":"source","source":"draw"}},"right":{"kind":"lit","value":3}},{"kind":"compare","op":"eq","left":{"kind":"at","index":3,"of":{"kind":"source","source":"draw"}},"right":{"kind":"lit","value":4}},{"kind":"compare","op":"eq","left":{"kind":"at","index":4,"of":{"kind":"source","source":"draw"}},"right":{"kind":"lit","value":5}},{"kind":"compare","op":"eq","left":{"kind":"at","index":5,"of":{"kind":"source","source":"draw"}},"right":{"kind":"lit","value":6}}]}}]}}}

"win if my ticket is exactly the set {1, 2, 3, 4, 5, 6}, in any order" (unordered LITERAL set) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"and","clauses":[{"kind":"contains","array":{"kind":"source","source":"guess"},"value":{"kind":"lit","value":1}},{"kind":"contains","array":{"kind":"source","source":"guess"},"value":{"kind":"lit","value":2}},{"kind":"contains","array":{"kind":"source","source":"guess"},"value":{"kind":"lit","value":3}},{"kind":"contains","array":{"kind":"source","source":"guess"},"value":{"kind":"lit","value":4}},{"kind":"contains","array":{"kind":"source","source":"guess"},"value":{"kind":"lit","value":5}},{"kind":"contains","array":{"kind":"source","source":"guess"},"value":{"kind":"lit","value":6}}]}}}

"win if the guess and draw contain the same set of numbers, regardless of order" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"eq","left":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}},"right":{"kind":"lit","value":6}}}}

"win if every guessed number is lower than the drawn number in the same position" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"pairs_forall","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"},"where":{"kind":"compare","op":"lt","left":{"kind":"pair","side":"left"},"right":{"kind":"pair","side":"right"}}}}}

"all six guessed numbers must be in the same tens range as the drawn number in the corresponding position" / "12 31 24 and 11 30 29 match as 10 30 20 in the same order" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"pairs_forall","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"},"where":{"kind":"compare","op":"eq","left":{"kind":"arith","op":"div","left":{"kind":"pair","side":"left"},"right":{"kind":"lit","value":10}},"right":{"kind":"arith","op":"div","left":{"kind":"pair","side":"right"},"right":{"kind":"lit","value":10}}}}}}

"win if the second guessed number equals the second drawn number" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"eq","left":{"kind":"at","index":1,"of":{"kind":"source","source":"guess"}},"right":{"kind":"at","index":1,"of":{"kind":"source","source":"draw"}}}}}

"first pick only needs to be higher than the first drawn number" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"gt","left":{"kind":"at","index":0,"of":{"kind":"source","source":"guess"}},"right":{"kind":"at","index":0,"of":{"kind":"source","source":"draw"}}}}}

"win if the absolute difference between each guessed number and drawn number in the same position is at most 5" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"pairs_forall","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"},"where":{"kind":"compare","op":"lte","left":{"kind":"abs","of":{"kind":"arith","op":"sub","left":{"kind":"pair","side":"left"},"right":{"kind":"pair","side":"right"}}},"right":{"kind":"lit","value":5}}}}}

"win if exactly 2 guessed numbers match in the same position" (counted pairs) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"eq","left":{"kind":"reduce","op":"sum","of":{"kind":"pairs_map","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"},"expr":{"kind":"ite","if":{"kind":"compare","op":"eq","left":{"kind":"pair","side":"left"},"right":{"kind":"pair","side":"right"}},"then":{"kind":"lit","value":1},"else":{"kind":"lit","value":0}}}},"right":{"kind":"lit","value":2}}}}

"win if exactly 2 guessed numbers are greater than the drawn number in the same position" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"eq","left":{"kind":"reduce","op":"sum","of":{"kind":"pairs_map","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"},"expr":{"kind":"ite","if":{"kind":"compare","op":"gt","left":{"kind":"pair","side":"left"},"right":{"kind":"pair","side":"right"}},"then":{"kind":"lit","value":1},"else":{"kind":"lit","value":0}}}},"right":{"kind":"lit","value":2}}}}

"win if at least 3 guessed numbers have the same last digit as any drawn number" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"gte","left":{"kind":"reduce","op":"count","of":{"kind":"filter","of":{"kind":"digits","place":"units","of":{"kind":"source","source":"guess"}},"where":{"kind":"contains","array":{"kind":"digits","place":"units","of":{"kind":"source","source":"draw"}},"value":{"kind":"elem"}}}},"right":{"kind":"lit","value":3}}}}

"win if all guessed numbers are between the smallest and largest drawn number, inclusive" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"forall","of":{"kind":"source","source":"guess"},"where":{"kind":"and","clauses":[{"kind":"compare","op":"gte","left":{"kind":"elem"},"right":{"kind":"reduce","op":"min","of":{"kind":"source","source":"draw"}}},{"kind":"compare","op":"lte","left":{"kind":"elem"},"right":{"kind":"reduce","op":"max","of":{"kind":"source","source":"draw"}}}]}}}}

"win if the total absolute position-by-position difference between guess and draw is 30 or less" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"lte","left":{"kind":"reduce","op":"sum","of":{"kind":"pairs_map","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"},"expr":{"kind":"abs","of":{"kind":"arith","op":"sub","left":{"kind":"pair","side":"left"},"right":{"kind":"pair","side":"right"}}}}},"right":{"kind":"lit","value":30}}}}

"win if guessed position 1 equals drawn position 6, position 2 equals drawn position 5, and so on" (pair against the reversed draw) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"pairs_forall","left":{"kind":"source","source":"guess"},"right":{"kind":"reverse","of":{"kind":"source","source":"draw"}},"where":{"kind":"compare","op":"eq","left":{"kind":"pair","side":"left"},"right":{"kind":"pair","side":"right"}}}}}

"at least 4 of the 6 reversed positions must match" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"gte","left":{"kind":"reduce","op":"sum","of":{"kind":"pairs_map","left":{"kind":"source","source":"guess"},"right":{"kind":"reverse","of":{"kind":"source","source":"draw"}},"expr":{"kind":"ite","if":{"kind":"compare","op":"eq","left":{"kind":"pair","side":"left"},"right":{"kind":"pair","side":"right"}},"then":{"kind":"lit","value":1},"else":{"kind":"lit","value":0}}}},"right":{"kind":"lit","value":4}}}}

"win if the number of even guessed numbers equals the number of even drawn numbers" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"eq","left":{"kind":"reduce","op":"count","of":{"kind":"filter","of":{"kind":"source","source":"guess"},"where":{"kind":"compare","op":"eq","left":{"kind":"arith","op":"mod","left":{"kind":"elem"},"right":{"kind":"lit","value":2}},"right":{"kind":"lit","value":0}}}},"right":{"kind":"reduce","op":"count","of":{"kind":"filter","of":{"kind":"source","source":"draw"},"where":{"kind":"compare","op":"eq","left":{"kind":"arith","op":"mod","left":{"kind":"elem"},"right":{"kind":"lit","value":2}},"right":{"kind":"lit","value":0}}}}}}}

"win if the guessed sum is greater than the drawn sum and at least 2 numbers match" (compound — keep BOTH clauses) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"and","clauses":[{"kind":"compare","op":"gt","left":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"guess"}},"right":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"draw"}}},{"kind":"compare","op":"gte","left":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}},"right":{"kind":"lit","value":2}}]}}}

"win if the smallest guessed number equals the smallest drawn number" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"eq","left":{"kind":"reduce","op":"min","of":{"kind":"source","source":"guess"}},"right":{"kind":"reduce","op":"min","of":{"kind":"source","source":"draw"}}}}}

"win if the largest guessed number is greater than the largest drawn number" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"gt","left":{"kind":"reduce","op":"max","of":{"kind":"source","source":"guess"}},"right":{"kind":"reduce","op":"max","of":{"kind":"source","source":"draw"}}}}}

"four or more of my picked numbers show up in the result" / "four or more are somewhere in the draw" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"gte","left":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}},"right":{"kind":"lit","value":4}}}}

"sum of my two smallest picks equals the sum of the two smallest drawn numbers" (sort + slice) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"eq","left":{"kind":"reduce","op":"sum","of":{"kind":"slice","start":0,"end":2,"of":{"kind":"sort","order":"asc","of":{"kind":"source","source":"guess"}}}},"right":{"kind":"reduce","op":"sum","of":{"kind":"slice","start":0,"end":2,"of":{"kind":"sort","order":"asc","of":{"kind":"source","source":"draw"}}}}}}}

"ignore my highest picked number, then the rest of my ticket totals the same as the full draw" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"eq","left":{"kind":"reduce","op":"sum","of":{"kind":"slice","start":0,"end":-1,"of":{"kind":"sort","order":"asc","of":{"kind":"source","source":"guess"}}}},"right":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"draw"}}}}}

"drop up to two of my lowest picks, and after that I should still have three numbers in the draw" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"gte","left":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"slice","start":2,"of":{"kind":"sort","order":"asc","of":{"kind":"source","source":"guess"}}},"right":{"kind":"source","source":"draw"}}},"right":{"kind":"lit","value":3}}}}

"if doubling each pick stays within 1 to 100, I win when at least three doubled values are in the draw" (map + guard filter) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"gte","left":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"filter","of":{"kind":"map","of":{"kind":"source","source":"guess"},"expr":{"kind":"arith","op":"mul","left":{"kind":"elem"},"right":{"kind":"lit","value":2}}},"where":{"kind":"and","clauses":[{"kind":"compare","op":"gte","left":{"kind":"elem"},"right":{"kind":"lit","value":1}},{"kind":"compare","op":"lte","left":{"kind":"elem"},"right":{"kind":"lit","value":100}}]}},"right":{"kind":"source","source":"draw"}}},"right":{"kind":"lit","value":3}}}}

"ticket sum modulo 10 equals draw sum modulo 10" =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"eq","left":{"kind":"arith","op":"mod","left":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"guess"}},"right":{"kind":"lit","value":10}},"right":{"kind":"arith","op":"mod","left":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"draw"}},"right":{"kind":"lit","value":10}}}}}

"at least four picks within 3 of the drawn number in the same slot" (counted pairs — the novel-composition idiom) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"gte","left":{"kind":"reduce","op":"sum","of":{"kind":"pairs_map","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"},"expr":{"kind":"ite","if":{"kind":"compare","op":"lte","left":{"kind":"abs","of":{"kind":"arith","op":"sub","left":{"kind":"pair","side":"left"},"right":{"kind":"pair","side":"right"}}},"right":{"kind":"lit","value":3}},"then":{"kind":"lit","value":1},"else":{"kind":"lit","value":0}}}},"right":{"kind":"lit","value":4}}}}

"four picks are within ten of at least one drawn number" (any-draw closeness — cross-array quantification with elem up:1) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"gte","left":{"kind":"reduce","op":"count","of":{"kind":"filter","of":{"kind":"source","source":"guess"},"where":{"kind":"exists","of":{"kind":"source","source":"draw"},"where":{"kind":"compare","op":"lte","left":{"kind":"abs","of":{"kind":"arith","op":"sub","left":{"kind":"elem","up":1},"right":{"kind":"elem","up":0}}},"right":{"kind":"lit","value":10}}}}},"right":{"kind":"lit","value":4}}}}

"my picks include two consecutive numbers" (shifted zip of the sorted ticket) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"pairs_exists","left":{"kind":"slice","start":0,"end":-1,"of":{"kind":"sort","order":"asc","of":{"kind":"source","source":"guess"}}},"right":{"kind":"slice","start":1,"of":{"kind":"sort","order":"asc","of":{"kind":"source","source":"guess"}}},"where":{"kind":"compare","op":"eq","left":{"kind":"arith","op":"sub","left":{"kind":"pair","side":"right"},"right":{"kind":"pair","side":"left"}},"right":{"kind":"lit","value":1}}}}}

"no two of my picks are within 5 of each other" (shifted zip, forall) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"pairs_forall","left":{"kind":"slice","start":0,"end":-1,"of":{"kind":"sort","order":"asc","of":{"kind":"source","source":"guess"}}},"right":{"kind":"slice","start":1,"of":{"kind":"sort","order":"asc","of":{"kind":"source","source":"guess"}}},"where":{"kind":"compare","op":"gte","left":{"kind":"arith","op":"sub","left":{"kind":"pair","side":"right"},"right":{"kind":"pair","side":"left"}},"right":{"kind":"lit","value":5}}}}}

"more even numbers in my first half than my second half" (halves / zones) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"gt","left":{"kind":"reduce","op":"count","of":{"kind":"filter","of":{"kind":"slice","start":0,"end":3,"of":{"kind":"source","source":"guess"}},"where":{"kind":"compare","op":"eq","left":{"kind":"arith","op":"mod","left":{"kind":"elem"},"right":{"kind":"lit","value":2}},"right":{"kind":"lit","value":0}}}},"right":{"kind":"reduce","op":"count","of":{"kind":"filter","of":{"kind":"slice","start":3,"of":{"kind":"source","source":"guess"}},"where":{"kind":"compare","op":"eq","left":{"kind":"arith","op":"mod","left":{"kind":"elem"},"right":{"kind":"lit","value":2}},"right":{"kind":"lit","value":0}}}}}}}

"the units digits of my ticket sum to more than the draw's" (digit aggregation) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"compare","op":"gt","left":{"kind":"reduce","op":"sum","of":{"kind":"digits","place":"units","of":{"kind":"source","source":"guess"}}},"right":{"kind":"reduce","op":"sum","of":{"kind":"digits","place":"units","of":{"kind":"source","source":"draw"}}}}}}

"whoever matches the most numbers" / "acertar mais números" (ranking max) =>
{"schemaVersion":3,"result":{"type":"ranking","direction":"max","tieBreak":"share_pool","score":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}}}}

"whoever misses the most numbers" / "errar mais números" (ranking max over misses) =>
{"schemaVersion":3,"result":{"type":"ranking","direction":"max","tieBreak":"share_pool","score":{"kind":"reduce","op":"count","of":{"kind":"difference","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}}}}

"whoever matches the most units digits" =>
{"schemaVersion":3,"result":{"type":"ranking","direction":"max","tieBreak":"share_pool","score":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"digits","place":"units","of":{"kind":"source","source":"guess"}},"right":{"kind":"digits","place":"units","of":{"kind":"source","source":"draw"}}}}}}

"whoever's guessed sum is closest to the drawn sum" (ranking min over the ABSOLUTE difference) =>
{"schemaVersion":3,"result":{"type":"ranking","direction":"min","tieBreak":"share_pool","score":{"kind":"abs","of":{"kind":"arith","op":"sub","left":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"guess"}},"right":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"draw"}}}}}}

"win if you match at least one number AND at least one tens digit" / "acertar 1 número e 1 dezena" (compound — keep BOTH clauses) =>
{"schemaVersion":3,"result":{"type":"predicate","predicate":{"kind":"and","clauses":[{"kind":"compare","op":"gte","left":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}},"right":{"kind":"lit","value":1}},{"kind":"compare","op":"gte","left":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"digits","place":"tens","of":{"kind":"source","source":"guess"}},"right":{"kind":"digits","place":"tens","of":{"kind":"source","source":"draw"}}}},"right":{"kind":"lit","value":1}}]}}}
