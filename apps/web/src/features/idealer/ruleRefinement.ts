export interface RuleRefinementContext {
  currentRuleText?: string | null;
  refinementQuestions?: readonly string[] | null;
  suggestedRewrite?: string | null;
}

const CHAT_TOPIC_PATTERN =
  /\b(cost|costs|price|fee|fees|payment|example|examples|how does it work|how rules work|allowed|valid|invalid|quanto|custa|taxa|exemplo|exemplos|como funciona|permitido|valido|invalido)\b/i;

const REFINEMENT_PATTERN =
  /\b(add|also|instead|change|make|require|requires|use|count|remove|replace|with|without|yes|no|sim|nao|ignore|regardless|any order|unordered|order|ordered|same order|in order|all\s*6|six|exactly|at least|at most|more|less|greater|lower|higher|same|equal|sum|digit|digits|units|tens|even|odd|match|matches|miss|misses)\b/i;

const NEW_RULE_PATTERN =
  /^(new\s+(clean\s+)?rule|replace\s+with|start\s+over|use\s+this\s+instead|win\s+if)\b/i;

const EXPLICIT_PATCH_PATTERN =
  /^(add|also|change|make|require|requires|count|remove|with|without|instead)\b/i;

function cleanSentence(value: string) {
  return value.trim().replace(/[.!?\s]+$/u, "");
}

function countWords(value: string) {
  return value.trim().split(/\s+/u).filter(Boolean).length;
}

export function getRuleRefinementBase(context: RuleRefinementContext) {
  return (
    context.suggestedRewrite?.trim() ||
    context.currentRuleText?.trim() ||
    null
  );
}

export function isExplicitRuleRefinementPatch(message: string) {
  const trimmed = message.trim();
  return Boolean(trimmed) && !NEW_RULE_PATTERN.test(trimmed) && EXPLICIT_PATCH_PATTERN.test(trimmed);
}

export function isRuleRefinementPatch(
  message: string,
  context: RuleRefinementContext,
) {
  const trimmed = message.trim();
  const base = getRuleRefinementBase(context);
  if (!base || !trimmed || CHAT_TOPIC_PATTERN.test(trimmed) || NEW_RULE_PATTERN.test(trimmed)) {
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
  }

  if (/^(no|nao)$/iu.test(correction)) {
    const orderQuestion = context.refinementQuestions?.some((question) =>
      /\border\b/i.test(question),
    );
    if (orderQuestion) {
      return `${cleanSentence(base)}. Order matters exactly as submitted.`;
    }
  }

  if (/\b(ignore|regardless|any order|unordered|order does not matter)\b/i.test(correction)) {
    return `${cleanSentence(base)}. Order is ignored.`;
  }

  if (/\b(in order|same order|ordered|order matters)\b/i.test(correction)) {
    return `${cleanSentence(base)}. Order matters exactly as submitted.`;
  }

  if (/\bat least\s+([1-6]|one|two|three|four|five|six)\b.{0,80}\breversed?\s+positions?\b.{0,30}\bmatch/i.test(correction)) {
    return `${cleanSentence(base)}. ${correction}.`;
  }

  return `${cleanSentence(base)}. Additional correction: ${correction}.`;
}
