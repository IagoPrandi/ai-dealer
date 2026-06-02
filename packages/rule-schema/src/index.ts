import { z } from "zod";

export const ruleAstSchema = z.object({
  schemaVersion: z.literal(1),
  node: z.object({
    kind: z.enum(["match_count_at_least", "sum_equals", "ordered_exact"]),
    value: z.number().int().optional()
  })
});

export type RuleAst = z.infer<typeof ruleAstSchema>;
