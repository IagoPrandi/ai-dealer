export interface RuleRefinementContext {
  /** Whether `currentRuleText` was itself a previously-VALID rule. A patch may
   * only build on a usable base; appending a correction to a still-invalid draft
   * cannot fix it and re-triggers the same clarification (an infinite loop). */
  baseWasValid?: boolean;
  currentRuleText?: string | null;
  refinementQuestions?: readonly string[] | null;
  suggestedRewrite?: string | null;
  suggestedRewrites?: readonly string[] | null;
  /** A terminal semantic rejection cannot be repaired by appending a short
   * clarification to the rejected draft. The user must choose or write a full
   * replacement rule. */
  triviallyAlwaysTrue?: boolean;
}

export interface RuleGuidanceContext extends RuleRefinementContext {
  apiCode?: string | null;
  clarityNote?: string | null;
  confirmationRequired?: boolean;
  /** A conversational suggestion that still must go through normal preflight. */
  dealerSuggestion?: boolean;
  needsClarification?: boolean;
  reasonSummary?: string | null;
  /** The rule's canonical meaning already held a mandate (was Rule of the Hour)
   * and is blocked verbatim (PRD 6.13). Suggestions must ADD a differentiating
   * condition rather than re-offer the same rule, or the block never clears. */
  reproposalBlocked?: boolean;
  sanitizedText?: string | null;
}

export interface RuleGuidanceOption {
  label: string;
  text: string;
}

export function getVisibleRuleDifficultyClass(input: {
  ast?: unknown | null;
  decision?: "INVALID" | "VALID";
  difficultyClass?: string;
}) {
  return input.decision === "VALID" || Boolean(input.ast)
    ? input.difficultyClass
    : undefined;
}

const CHAT_TOPIC_PATTERN =
  /\b(cost|costs|price|fee|fees|payment|example|examples|how does it work|how rules work|allowed|valid|invalid|quanto|custa|taxa|exemplo|exemplos|como funciona|permitido|valido|invalido)\b/i;

const REFINEMENT_PATTERN =
  /\b(add|also|instead|change|make|require|requires|use|count|remove|replace|with|without|yes|no|sim|nao|ignore|regardless|any order|unordered|order|ordered|same order|in order|all\s*6|six|exactly|at least|at most|more|less|greater|lower|higher|same|equal|sum|digit|digits|units|tens|even|odd|match|matches|miss|misses)\b/i;

const NEW_RULE_PATTERN =
  /^(new\s+(clean\s+)?rule|replace\s+with|start\s+over|use\s+this\s+instead|win\s+if)\b/i;

const EXPLICIT_PATCH_PATTERN =
  /^(add|also|change|make|require|requires|count|remove|with|without|instead)\b/i;

const RULE_CREATION_HELP_REQUEST_PATTERNS = [
  /^(i\s+)?(want|wanna|would like)\s+to\s+(create|start|write|make)\s+(a\s+)?(new|another)\s+rule[.!?\s]*$/i,
  /^(create|start|write|make)\s+(a\s+)?(new|another)\s+rule[.!?\s]*$/i,
  /^(new|another)\s+rule[.!?\s]*$/i,
  /^(eu\s+)?(quero|queria|gostaria de|vou)\s+(criar|comecar|fazer|escrever)\s+(uma\s+)?(nova|outra)\s+regra[.!?\s]*$/i,
  /^(criar|comecar|fazer|escrever)\s+(uma\s+)?(nova|outra)\s+regra[.!?\s]*$/i,
  /^(nova|outra)\s+regra[.!?\s]*$/i,
];

function cleanSentence(value: string) {
  return value.trim().replace(/[.!?\s]+$/u, "");
}

function countWords(value: string) {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

function normalizeIntentText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function dedupeOptions(options: RuleGuidanceOption[]) {
  const seen = new Set<string>();
  const result: RuleGuidanceOption[] = [];
  for (const option of options) {
    const text = option.text.trim();
    if (!text || seen.has(text.toLowerCase())) {
      continue;
    }
    seen.add(text.toLowerCase());
    result.push({ ...option, text });
  }
  return result;
}

export function getRuleRefinementBase(context: RuleRefinementContext) {
  if (context.triviallyAlwaysTrue) {
    return null;
  }
  // Prefer the dealer's concrete suggested rewrite. Only fall back to the raw
  // current rule text when it was previously VALID — otherwise a clarification
  // answer would be appended to an unfixable draft and loop forever.
  const rewrite =
    context.suggestedRewrites?.find((candidate) => candidate.trim())?.trim() ??
    context.suggestedRewrite?.trim();
  if (rewrite) {
    return rewrite;
  }
  if (context.baseWasValid) {
    return context.currentRuleText?.trim() || null;
  }
  return null;
}

export function isExplicitRuleRefinementPatch(message: string) {
  const trimmed = message.trim();
  return (
    Boolean(trimmed) &&
    !NEW_RULE_PATTERN.test(trimmed) &&
    EXPLICIT_PATCH_PATTERN.test(trimmed)
  );
}

export function isRuleCreationHelpRequest(message: string) {
  const normalized = normalizeIntentText(message);
  return RULE_CREATION_HELP_REQUEST_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

export function isRuleRefinementPatch(
  message: string,
  context: RuleRefinementContext,
) {
  const trimmed = message.trim();
  const base = getRuleRefinementBase(context);
  if (
    !base ||
    !trimmed ||
    CHAT_TOPIC_PATTERN.test(trimmed) ||
    NEW_RULE_PATTERN.test(trimmed) ||
    isRuleCreationHelpRequest(trimmed)
  ) {
    return false;
  }

  return REFINEMENT_PATTERN.test(trimmed) || countWords(trimmed) <= 8;
}

export function composeRefinedRuleDraft(
  message: string,
  context: RuleRefinementContext,
) {
  const base = getRuleRefinementBase(context);
  if (!base) {
    return null;
  }

  const correction = cleanSentence(message);
  if (!correction) {
    return null;
  }

  if (/^(yes|sim)$/iu.test(correction)) {
    const orderQuestion = context.refinementQuestions?.some((question) =>
      /\border\b/i.test(question),
    );
    if (orderQuestion) {
      return `${cleanSentence(base)}. Order is ignored.`;
    }
    const confirmsSharedOutcome = context.refinementQuestions?.some(
      (question) =>
        /ignore the player's guess|every eligible guess wins or loses together/i.test(
          question,
        ),
    );
    const confirmsDrawIndependent = context.refinementQuestions?.some(
      (question) =>
        /ignore the official draw|fixed before the draw/i.test(question),
    );
    const confirmsInclusiveRange = context.refinementQuestions?.some(
      (question) => /range include both endpoints/i.test(question),
    );
    const confirmations = [
      confirmsSharedOutcome
        ? "The player's guess does not affect the result."
        : "",
      confirmsDrawIndependent
        ? "The official draw does not affect the result."
        : "",
      confirmsInclusiveRange
        ? "The numeric range includes both endpoints."
        : "",
    ].filter(Boolean);
    if (confirmations.length > 0) {
      return `${cleanSentence(base)}. ${confirmations.join(" ")}`;
    }
  }

  if (/^(no|nao)$/iu.test(correction)) {
    const orderQuestion = context.refinementQuestions?.some((question) =>
      /\border\b/i.test(question),
    );
    if (orderQuestion) {
      return `${cleanSentence(base)}. Order matters exactly as submitted.`;
    }
  }

  if (
    /\b(ignore|regardless|any order|unordered|order does not matter)\b/i.test(
      correction,
    )
  ) {
    return `${cleanSentence(base)}. Order is ignored.`;
  }

  if (/\b(in order|same order|ordered|order matters)\b/i.test(correction)) {
    return `${cleanSentence(base)}. Order matters exactly as submitted.`;
  }

  if (
    /\bat least\s+([1-6]|one|two|three|four|five|six)\b.{0,80}\breversed?\s+positions?\b.{0,30}\bmatch/i.test(
      correction,
    )
  ) {
    return `${cleanSentence(base)}. ${correction}.`;
  }

  return `${cleanSentence(base)}. Additional correction: ${correction}.`;
}

export function getRuleGuidanceTitle(context: RuleGuidanceContext) {
  if (context.dealerSuggestion) {
    return "Try this rule?";
  }
  if (context.triviallyAlwaysTrue) {
    return "Choose a valid variation";
  }
  if (context.confirmationRequired) {
    return "Confirm rule impact";
  }
  if (context.reproposalBlocked) {
    return "Differentiate this rule?";
  }
  if (
    context.apiCode ||
    context.reasonSummary?.toLowerCase().includes("external")
  ) {
    return "Fix this blocked rule?";
  }
  return "Clarify this rule?";
}

export function buildRuleGuidanceOptions(
  context: RuleGuidanceContext,
): RuleGuidanceOption[] {
  // Only the structured, API-vetted list is selectable. The singular field is
  // retained solely as a refinement-base compatibility field; rendering it
  // directly would let an older generic server suggestion bypass the new
  // intent-preservation contract.
  const rewrites = context.suggestedRewrites ?? [];
  return dedupeOptions(
    rewrites.map((text) => ({
      label: context.dealerSuggestion
        ? "Try dealer suggestion"
        : "Use intent-preserving rewrite",
      text,
    })),
  ).slice(0, 4);
}
