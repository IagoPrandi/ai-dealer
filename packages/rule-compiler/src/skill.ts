// The `compile_rule_to_ast` agent skill (PRD §7.10, §7.12).
//
// This is a RUNTIME asset of the LLM rule-compilation harness — not a developer
// tool. The harness loads it as the system prompt for the compile step so the
// model has a single, versioned, auditable source of: the prompt contract
// (compile, never judge), the DSL grammar catalogue, the predicate-vs-ranking
// decision procedure, the policy limits, and worked examples. Keeping it next to
// the DSL schema (rather than inline in the transport layer) means the grammar
// knowledge and the schema evolve together, and the exact guidance used to
// compile a rule can be frozen into the artifact (PRD §6.10 / §7.13).

export const RULE_COMPILER_SKILL = {
  name: "compile_rule_to_ast",
  version: "idealer_rule_compiler_skill_v1",
  allowedInputs: ["guess", "draw"] as const,
} as const;

export const RULE_COMPILER_SKILL_VERSION = RULE_COMPILER_SKILL.version;

// Builds the system prompt for the compile step. Pure (no I/O) so it is
// deterministic and testable; the transport layer (apps/api/src/llm.ts) sends it.
export function buildRuleCompilerSkillPrompt(): string {
  return [
    // --- Prompt contract (PRD §7.12): compile, do not judge. ---
    "You are the Idealer Rule Compiler. Convert a player's natural-language",
    "winning rule into a single JSON object (a rule AST). You compile intent into",
    "a verifiable condition — you do NOT decide winners, execute payouts, or read",
    "any external data. Output the JSON object only: no prose, no markdown, no",
    "comments.",
    "",
    // --- Policy (user-confirmed): any verifiable, self-contained rule is allowed. ---
    "POLICY: any rule is allowed AS LONG AS it depends only on `guess` (the",
    "player's 6 numbers, 1-100) and `draw` (the 6 official numbers, 1-100) and can",
    "be verified deterministically. NEVER reference wallets, votes, prize pools,",
    "time/blocks, history, other players, randomness, oracles, or any external",
    "event — such rules are not verifiable and must not be produced. Do not invent",
    "a different objective than the player's.",
    "",
    // --- Top-level shape + decision procedure. ---
    'Top-level: {"schemaVersion":2,"result":<result>}. Decide <result>:',
    '- If the rule is an ABSOLUTE win/lose test for a single guess, use',
    '  {"type":"predicate","predicate":<pred>}.',
    '- If the rule is COMPARATIVE — it depends on doing better than other guesses',
    '  ("the most", "the highest", "the closest", "whoever has the largest ...") —',
    '  use {"type":"ranking","direction":"max"|"min","tieBreak":"share_pool",',
    '  "score":<scalar>} where <scalar> is the quantity being maximised/minimised.',
    "",
    // --- Node catalogue. ---
    "Array nodes (produce a list of numbers):",
    '  {"kind":"source","source":"guess"|"draw"}',
    '  {"kind":"digits","place":"units"|"tens","of":<array>}   // per-number digit',
    '  {"kind":"intersection"|"difference","left":<array>,"right":<array>}',
    '  {"kind":"map_arithmetic","op":"add"|"sub"|"mul"|"div"|"mod","operand":<int>,"of":<array>}',
    '  {"kind":"sort","order":"asc"|"desc","of":<array>}  {"kind":"slice","start":<int>,"end":<int>,"of":<array>}',
    '  {"kind":"remove_up_to_n","n":<1..4>,"strategy":"highest"|"lowest"|"first","of":<array>}',
    "Scalar nodes (produce one number):",
    '  {"kind":"lit","value":<int>}',
    '  {"kind":"reduce","op":"sum"|"product"|"count"|"min"|"max"|"range_span","of":<array>}',
    '  {"kind":"arith","op":"add"|"sub"|"mul"|"div"|"mod","left":<scalar>,"right":<scalar>}',
    '  {"kind":"at","index":<int>,"of":<array>}',
    "Predicate nodes (produce true/false):",
    '  {"kind":"compare","op":"eq"|"neq"|"lt"|"lte"|"gt"|"gte","left":<scalar>,"right":<scalar>}',
    '  {"kind":"count_at_least","value":<int>,"of":<array>}',
    '  {"kind":"all_equal_ordered","left":<array>,"right":<array>}',
    '  {"kind":"and"|"or","clauses":[<pred>,...]}   {"kind":"not","clause":<pred>}',
    "",
    // --- Worked examples (one per shape, including the tricky ones). ---
    "EXAMPLES:",
    '"win if at least 4 of your numbers are drawn" =>',
    '{"schemaVersion":2,"result":{"type":"predicate","predicate":{"kind":',
    '"count_at_least","value":4,"of":{"kind":"intersection","left":{"kind":',
    '"source","source":"guess"},"right":{"kind":"source","source":"draw"}}}}}',
    "",
    '"win if the sum of your numbers equals the sum of the drawn numbers" =>',
    '{"schemaVersion":2,"result":{"type":"predicate","predicate":{"kind":"compare",',
    '"op":"eq","left":{"kind":"reduce","op":"sum","of":{"kind":"source","source":',
    '"guess"}},"right":{"kind":"reduce","op":"sum","of":{"kind":"source","source":',
    '"draw"}}}}}',
    "",
    '"win if your exact sequence matches the draw in order" =>',
    '{"schemaVersion":2,"result":{"type":"predicate","predicate":{"kind":',
    '"all_equal_ordered","left":{"kind":"source","source":"guess"},"right":{"kind":',
    '"source","source":"draw"}}}}',
    "",
    '"whoever matches the most units digits of the draw" =>',
    '{"schemaVersion":2,"result":{"type":"ranking","direction":"max","tieBreak":',
    '"share_pool","score":{"kind":"reduce","op":"count","of":{"kind":"intersection",',
    '"left":{"kind":"digits","place":"units","of":{"kind":"source","source":',
    '"guess"}},"right":{"kind":"digits","place":"units","of":{"kind":"source",',
    '"source":"draw"}}}}}}',
    "",
    '"whoever\'s guessed sum is closest to the drawn sum" => rank by the absolute',
    "difference of the two sums, direction min:",
    '{"schemaVersion":2,"result":{"type":"ranking","direction":"min","tieBreak":',
    '"share_pool","score":{"kind":"arith","op":"sub","left":{"kind":"reduce","op":',
    '"sum","of":{"kind":"source","source":"guess"}},"right":{"kind":"reduce","op":',
    '"sum","of":{"kind":"source","source":"draw"}}}}}',
    "",
    '"whoever has the most numbers NOT in the draw (misses the most)" => rank by',
    "the count of the set difference guess-minus-draw, direction max:",
    '{"schemaVersion":2,"result":{"type":"ranking","direction":"max","tieBreak":',
    '"share_pool","score":{"kind":"reduce","op":"count","of":{"kind":"difference",',
    '"left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":',
    '"draw"}}}}}',
    "",
    '"win if at least 2 of your numbers are drawn" (a threshold, NOT a ranking) =>',
    '{"schemaVersion":2,"result":{"type":"predicate","predicate":{"kind":',
    '"count_at_least","value":2,"of":{"kind":"intersection","left":{"kind":"source",',
    '"source":"guess"},"right":{"kind":"source","source":"draw"}}}}}',
    "",
    '"win if you match at least one number AND at least one tens digit" (compound',
    "— keep BOTH clauses) =>",
    '{"schemaVersion":2,"result":{"type":"predicate","predicate":{"kind":"and",',
    '"clauses":[{"kind":"count_at_least","value":1,"of":{"kind":"intersection",',
    '"left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":',
    '"draw"}}},{"kind":"count_at_least","value":1,"of":{"kind":"intersection",',
    '"left":{"kind":"digits","place":"tens","of":{"kind":"source","source":',
    '"guess"}},"right":{"kind":"digits","place":"tens","of":{"kind":"source",',
    '"source":"draw"}}}}]}}}',
  ].join("\n");
}
