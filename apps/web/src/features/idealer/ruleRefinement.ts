export interface RuleRefinementContext {
  currentRuleText?: string | null;
  refinementQuestions?: readonly string[] | null;
  suggestedRewrite?: string | null;
}

const CHAT_TOPIC_PATTERN =
  /\b(cost|costs|price|fee|fees|payment|example|examples|how does it work|how rules work|allowed|valid|invalid|quanto|custa|taxa|exemplo|exemplos|como funciona|permitido|valido|válido|invalido|inválido)\b/i;

const REFINEMENT_PATTERN =
  /\b(add|also|instead|change|make|require|requires|use|count|remove|replace|with|without|yes|no|sim|nao|não|ignore|regardless|any order|unordered|order|ordered|same order|in order|all\s*6|six|exactly|at least|at most|more|less|greater|lower|higher|same|equal|sum|digit|digits|units|tens|even|odd|match|matches|miss|misses)\b/i;

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

export function isRuleRefinementPatch(
  message: string,
  context: RuleRefinementContext,
) {
  const trimmed = message.trim();
  const base = getRuleRefinementBase(context);
  if (!base || !trimmed || CHAT_TOPIC_PATTERN.test(trimmed)) {
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

  if (/^(no|nao|não)$/iu.test(correction)) {
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

  return `${cleanSentence(base)}. Additional correction: ${correction}.`;
}
