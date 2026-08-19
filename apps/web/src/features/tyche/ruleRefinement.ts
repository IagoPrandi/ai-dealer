export interface RuleRefinementContext {
  /** Whether `currentRuleText` was itself a previously-VALID rule. A patch may
   * only build on a usable base; appending a correction to a still-invalid draft
   * cannot fix it and re-triggers the same clarification (an infinite loop). */
  baseWasValid?: boolean;
  /** An interpretation awaiting the player's answer is also a safe refinement
   * base: unlike a rejected compiled rule, it has not failed preflight yet. */
  baseCanBeClarified?: boolean;
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

const RULE_REPLACEMENT_PATTERN =
  /^(new\s+(clean\s+)?rule|replace\s+with|start\s+over|use\s+this\s+instead|nova\s+regra|substitu(?:a|ir)\s+por|come(?:ce|car)\s+de\s+novo|use\s+isto\s+no\s+lugar)\b/i;

const DECLARATIVE_RULE_PATTERN =
  /^(?:(?:i|eu)\s+)?(?:win|wins|ganho|ganha|venco|vence)\s+(?:if|when|se|quando)\b/i;

const REMAINDER_QUESTION_PATTERN =
  /\bremaining\s+(?:(one|two|three|four|five|[1-5])\s+)?(guessed|drawn)\s+numbers?\b/i;
const REMAINDER_REFERENCE_PATTERN =
  /\b(remaining|other|final|last|demais|restantes|ultimos?|resto|them|those|eles|elas)\b/i;
const REMAINDER_RESOLUTION_PATTERN =
  /\b(ignore(?:d|s|ing)?|unconstrained|irrelevant|free|may be any|can be any|do not matter|does not matter|do not affect|does not affect|ignorad[oa]s?|ignorar|livres?|qualquer|quaisquer|nao importam?|nao afetam?)\b/i;
const NEGATED_REMAINDER_RESOLUTION_PATTERN =
  /\b(do not|does not|must not|should not)\s+(?:be\s+)?(?:ignore(?:d)?|unconstrained|irrelevant)|\bnao\s+(?:devem?\s+ser\s+)?ignorad[oa]s?\b/i;

/**
 * Detect a complete winner-condition statement before topic-based chat routing.
 * The broader heuristic in Create also recognizes rules by their data terms,
 * but a direct declaration such as "vence se ..." is already unambiguously a
 * rule even when the rest uses vocabulary the client has not seen before.
 */
export function isDeclarativeRuleDraft(message: string) {
  return DECLARATIVE_RULE_PATTERN.test(normalizeIntentText(message));
}

function isNewRuleIntent(message: string) {
  const normalized = normalizeIntentText(message);
  return (
    RULE_REPLACEMENT_PATTERN.test(normalized) ||
    DECLARATIVE_RULE_PATTERN.test(normalized)
  );
}

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

function buildResolvedRemainderClause(
  message: string,
  questions: readonly string[] | null | undefined,
) {
  const questionMatch = questions
    ?.map((question) => question.match(REMAINDER_QUESTION_PATTERN))
    .find((match): match is RegExpMatchArray => Boolean(match));
  if (!questionMatch) {
    return null;
  }

  const normalized = normalizeIntentText(message);
  if (
    !REMAINDER_REFERENCE_PATTERN.test(normalized) ||
    !REMAINDER_RESOLUTION_PATTERN.test(normalized) ||
    NEGATED_REMAINDER_RESOLUTION_PATTERN.test(normalized) ||
    /\border\b/i.test(normalized)
  ) {
    return null;
  }

  const count = questionMatch[1] ?? "one";
  const numberNoun = count === "one" || count === "1" ? "number" : "numbers";
  const valueNoun = numberNoun === "number" ? "value" : "values";
  const effectVerb = numberNoun === "number" ? "does" : "do";
  return `The remaining ${count} ${questionMatch[2]} ${numberNoun} may be any valid unique ${valueNoun} and ${effectVerb} not affect the winning condition.`;
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
  // Prefer the dealer's concrete suggested rewrite. Only fall back to raw text
  // when it was previously VALID or is the current pre-compilation
  // interpretation. A rejected compiled rule remains an unsafe base because
  // appending to it can re-trigger the same clarification forever.
  const rewrite =
    context.suggestedRewrites?.find((candidate) => candidate.trim())?.trim() ??
    context.suggestedRewrite?.trim();
  if (rewrite) {
    return rewrite;
  }
  if (context.baseWasValid || context.baseCanBeClarified) {
    return context.currentRuleText?.trim() || null;
  }
  return null;
}

export function isExplicitRuleRefinementPatch(message: string) {
  const trimmed = normalizeIntentText(message);
  return (
    Boolean(trimmed) &&
    !isNewRuleIntent(trimmed) &&
    EXPLICIT_PATCH_PATTERN.test(trimmed)
  );
}

export function isRuleCreationHelpRequest(message: string) {
  const normalized = normalizeIntentText(message);
  return RULE_CREATION_HELP_REQUEST_PATTERNS.some((pattern) =>
    pattern.test(normalized),
  );
}

/**
 * Interrogative openings. Deliberately narrower than `QUESTION_PATTERN`, which
 * serves a different decision: the auxiliaries it also lists (can/could/should/
 * do/does/is/are/posso/pode/devo) open clarification ANSWERS as often as
 * questions ("can be any order", "pode ser em qualquer ordem"), so they must
 * never divert a message away from the draft.
 */
const WH_OPENING_PATTERN =
  /^(how|what|why|which|who|where|when|como|o que|qual|quais|quanto|quantos|quanta|quantas|por que|porque|para que|pra que|quando|onde)\b/iu;

/**
 * A question about the game is never a patch for the rule draft: appending it
 * asks the compiler to read "how are the prizes divided?" as part of the winner
 * condition. Three signals, in falling order of certainty:
 *
 * 1. Product vocabulary (`GAME_TOPIC_PATTERN`: prizes, rewards, voting, phases).
 *    Safe on its own because a rule may not reference any of it.
 * 2. A literal question mark — the one unambiguous marker the player controls.
 * 3. A wh-opening AND no rule vocabulary. The second half carries the weight: in
 *    Portuguese especially, wh-words open declarative clauses just as readily as
 *    questions ("o que importa e a soma", "quando a soma passar de 300 tambem
 *    vale"), and those are answers that belong in the draft. With no rule
 *    vocabulary at all there is nothing to append anyway.
 *
 * A wh-question that does carry rule vocabulary and no question mark ("what
 * happens when two guesses tie") stays a patch. That reading is genuinely
 * ambiguous mid-clarification, and a question mark resolves it.
 */
function isConversationalQuestion(message: string) {
  const normalized = normalizeIntentText(message);
  if (GAME_TOPIC_PATTERN.test(normalized) || /\?\s*$/u.test(normalized)) {
    return true;
  }
  return (
    WH_OPENING_PATTERN.test(normalized) && !RULE_DATA_PATTERN.test(normalized)
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
    isConversationalQuestion(trimmed) ||
    isNewRuleIntent(trimmed) ||
    isRuleCreationHelpRequest(trimmed)
  ) {
    return false;
  }

  // An interpretation explicitly awaiting an answer makes the next message that
  // answer, whatever words it uses. Without this, a legitimate but wordy answer
  // ("the remaining number should be any number between 5 and 100") matches no
  // refinement keyword, is too long for the short-answer allowance, and falls
  // through to the conversational path — where the dealer judges it as if it
  // were a standalone rule and reports it is not a complete winner condition.
  if (context.baseCanBeClarified) {
    return true;
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

  const resolvedRemainder = buildResolvedRemainderClause(
    correction,
    context.refinementQuestions,
  );
  if (resolvedRemainder) {
    return `${cleanSentence(base)}. ${resolvedRemainder}`;
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
    /\b(regardless of order|any order|unordered|order does not matter)\b/i.test(
      correction,
    ) || /\bignore(?:d|s|ing)?\s+(?:the\s+)?order\b/i.test(correction)
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

  if (context.baseCanBeClarified) {
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

const RULE_DECISION_PATTERN =
  /\b(win|wins|winner|winning|whoever|if|when|qualifies|eligible|ganha|ganhar|vence|vencer|vencedor|quem|se|quando)\b/i;

const RULE_DATA_PATTERN =
  /\b(guess|guesses|draw|drawn|numbers?|sequence|sum|total|digit|digits|units?|tens?|match|matches|matched|miss|misses|closest|highest|lowest|greater|less|equal|even|odd|prime|palpite|sorteio|numeros?|números?|dezena|dezenas|unidade|unidades|soma|maior|menor|igual|acertar|acerta|errar|erra|pares?|impares?|ímpares?)\b/i;

const RULE_SHAPE_PATTERN =
  /\b(at least|at most|exactly|closest|highest|lowest|greater than|less than|equal to|more than|fewer than|the most|the fewest|pelo menos|no maximo|no máximo|exatamente|mais|menos|maior|menor|igual)\b/i;

const GREETING_PATTERN =
  /^(hi|hello|hey|yo|oi|ola|olá|bom dia|boa tarde|boa noite|sup|e ai|e aí)[!.? ]*$/i;

const QUESTION_PATTERN =
  /^(how|what|why|where|when|can|could|should|do|does|is|are|como|o que|qual|quanto|quantos|quanta|quantas|por que|porque|quando|posso|pode|devo)\b/i;

const COST_TOPIC_PATTERN =
  /\b(cost|costs|price|fee|fees|payment|pay|paid|submit|submission|quanto|quantos|quanta|quantas|custa|custam|custo|preco|preço|valor|taxa|pagar|pagamento|enviar|submeter)\b/i;

const EXAMPLE_TOPIC_PATTERN =
  /\b(example|examples|sample|samples|idea|ideas|inspiration|suggestion|suggestions|exemplo|exemplos|ideia|ideias|inspira|sugestao|sugestão|sugestoes|sugestões)\b/i;

const HOW_IT_WORKS_TOPIC_PATTERN =
  /\b(how does it work|how this works|how rules work|como funciona|como isso funciona|como a regra funciona|funciona)\b/i;

const ALLOWED_TOPIC_PATTERN =
  /\b(allowed|valid|invalid|can i use|what can|only use|permitido|valido|válido|invalido|inválido|posso usar|pode usar|usar na regra|regras validas|regras válidas)\b/i;

// Rewards, tokenomics and round-flow vocabulary. These words identify a question
// about the product, never a winner condition: a rule may not reference prizes,
// votes, or other rounds, so matching them cannot swallow a genuine rule draft.
// `eliminar` and `rodada` are deliberately absent — "eliminar os dois menores"
// is an allowed rule operation and "vence a rodada quem..." is a rule draft.
const GAME_TOPIC_PATTERN =
  /\b(prize|prizes|reward|rewards|payout|payouts|tokenomics|tokens?|treasury|staking|locked|jackpot|elimination|eliminated|finalist|finalists|shortlist|voting|votes?|phase|phases|epoch|pr[eê]mio|pr[eê]mios|premia[cç][aã]o|recompensa|recompensas|tesouraria|elimina[cç][aã]o|eliminado|finalista|finalistas|vota[cç][aã]o|voto|votos|votar|fase|fases|[eé]poca)\b/i;

const SECURITY_RULE_DRAFT_PATTERN =
  /\b(ignore\b.{0,40}\b(app\s+)?rules?|previous instructions?|compile\b.{0,40}\bvalid|secretly|hide\b.{0,40}\b(blocked|invalid|rejected))\b/i;

const RULE_TIPS_TOPIC_PATTERN =
  /\b(tip|tips|improve|better|strategy|strategies|odds|popular|dica|dicas|melhorar|melhor|estrategia|estratégia|estrategias|estratégias|chance|chances|popular)\b/i;

export function isLikelyRuleDraft(text: string) {
  const trimmed = text.trim();
  if (!trimmed || GREETING_PATTERN.test(trimmed)) {
    return false;
  }
  if (isDeclarativeRuleDraft(trimmed)) {
    return true;
  }
  if (
    QUESTION_PATTERN.test(trimmed) ||
    COST_TOPIC_PATTERN.test(trimmed) ||
    EXAMPLE_TOPIC_PATTERN.test(trimmed) ||
    HOW_IT_WORKS_TOPIC_PATTERN.test(trimmed) ||
    ALLOWED_TOPIC_PATTERN.test(trimmed) ||
    RULE_TIPS_TOPIC_PATTERN.test(trimmed) ||
    GAME_TOPIC_PATTERN.test(trimmed)
  ) {
    return false;
  }

  return (
    SECURITY_RULE_DRAFT_PATTERN.test(trimmed) ||
    (RULE_DECISION_PATTERN.test(trimmed) && RULE_DATA_PATTERN.test(trimmed)) ||
    (RULE_SHAPE_PATTERN.test(trimmed) && RULE_DATA_PATTERN.test(trimmed))
  );
}

// Portuguese-only greeting tokens. The greeting fast-path answers without calling
// the dealer, so it has to pick the language itself; replying in English to "oi"
// contradicts the language contract the dealer prompt enforces everywhere else.
const PORTUGUESE_GREETING_PATTERN =
  /^(oi|ola|olá|bom dia|boa tarde|boa noite|e ai|e aí)[!.? ]*$/i;

export function getLocalGreetingReply(text: string) {
  const trimmed = text.trim();
  if (!GREETING_PATTERN.test(trimmed)) {
    return null;
  }
  return PORTUGUESE_GREETING_PATTERN.test(trimmed)
    ? "Oi! Me diga em uma frase como sua regra decide quem vence, comparando os seus números com os do sorteio."
    : "Hey. Send me one winner condition based on the guess and the official draw.";
}
