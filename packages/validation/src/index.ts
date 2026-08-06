import { z } from "zod";
import { RULE_MAX_TOKENS } from "@tyche/constants";

export const walletAddressSchema = z.string().min(32).max(64);

export const guessSchema = z
  .array(z.number().int().min(1).max(100))
  .length(6)
  .refine((values) => new Set(values).size === values.length, {
    message: "Guess numbers must be unique"
  });

export const rulePromptSchema = z.object({
  text: z.string().trim().min(1),
  tokenCount: z.number().int().min(1).max(RULE_MAX_TOKENS)
});
