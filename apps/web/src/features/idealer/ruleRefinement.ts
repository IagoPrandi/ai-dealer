export interface RuleRefinementContext {
  currentRuleText?: string | null;
  refinementQuestions?: readonly string[] | null;
  suggestedRewrite?: string | null;
}

export interface RuleGuidanceContext extends RuleRefinementContext {
  apiCode?: string | null;
  clarityNote?: string | null;
  needsClarification?: boolean;
  reasonSummary?: string | null;
  sanitizedText?: string | null;
}

export interface RuleGuidanceOption {
  label: string;
  text: string;
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

export function isRuleCreationHelpRequest(message: string) {
  const normalized = normalizeIntentText(message);
  return RULE_CREATION_HELP_REQUEST_PATTERNS.some((pattern) => pattern.test(normalized));
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

export function getRuleGuidanceTitle(context: RuleGuidanceContext) {
  if (context.apiCode || context.reasonSummary?.toLowerCase().includes("external")) {
    return "Fix this blocked rule?";
  }
  return "Clarify this rule?";
}

export function buildRuleGuidanceOptions(
  context: RuleGuidanceContext,
): RuleGuidanceOption[] {
  const text = [
    context.apiCode ?? "",
    context.sanitizedText ?? "",
    context.currentRuleText ?? "",
    context.reasonSummary ?? "",
    context.clarityNote ?? "",
  ].join(" ");
  const options: RuleGuidanceOption[] = [];

  if (context.apiCode === "RULE_PROMPT_INJECTION" || /\b(ignore|secretly|hide|prompt injection|compile.*valid)\b/i.test(text)) {
    options.push(
      {
        label: "Start with a clean measurable rule",
        text: "New clean rule: win if exactly 2 guessed numbers match in the same position.",
      },
      {
        label: "Use only guess and draw",
        text: "New clean rule: win if at least 4 guessed numbers appear in the draw, regardless of order.",
      },
    );
  }

  if (
    context.apiCode === "RULE_EXTERNAL_DEPENDENCY" ||
    (/\b(other players?|all players?|among all players|closest among)\b/i.test(text) &&
      !/\bwithout comparing other players\b/i.test(text))
  ) {
    options.push(
      {
        label: "Remove other-player comparison",
        text: "Win if my guess is close to the draw without comparing other players.",
      },
      {
        label: "Use total position distance",
        text: "Win if the total absolute position-by-position difference between guess and draw is 30 or less.",
      },
    );
  }

  if (context.suggestedRewrite?.trim()) {
    options.push({
      label: "Use the suggested rewrite",
      text: context.suggestedRewrite,
    });
  }

  if (/\b(close|similar|almost|near|one step away)\b/i.test(text)) {
    options.push(
      {
        label: "Use total distance",
        text: "Win if the total absolute position-by-position difference between guess and draw is 30 or less.",
      },
      {
        label: "Use same-position tolerance",
        text: "Win if each guessed number is within 5 of the drawn number in the same position.",
      },
      {
        label: "Use match count",
        text: "Win if at least 3 guessed numbers appear in the draw, regardless of order.",
      },
    );
  }

  if (context.refinementQuestions?.some((question) => /\border\b/i.test(question))) {
    options.push(
      { label: "Ignore order", text: "Order is ignored." },
      { label: "Keep exact positions", text: "Order matters exactly as submitted." },
    );
  }

  for (const question of context.refinementQuestions ?? []) {
    if (/\bexact count|comparison|count or comparison\b/i.test(question)) {
      options.push({
        label: "Choose a concrete count",
        text: "Win if at least 3 guessed numbers appear in the draw, regardless of order.",
      });
    }
  }

  options.push({
    label: "Write a simple valid rule",
    text: "Win if at least 4 guessed numbers appear in the draw, regardless of order.",
  });

  return dedupeOptions(options).slice(0, 4);
}
