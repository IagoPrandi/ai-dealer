import type { RuleAst } from "@idealer/rule-compiler";

export interface RuleSemanticImpact {
  drawIndependent: boolean;
  rangeBoundsAmbiguous: boolean;
  sharedOutcome: boolean;
  usesDraw: boolean;
  usesGuess: boolean;
}

export interface RuleSemanticImpactReview {
  clarityNote: string;
  confirmationRequired: boolean;
  dealerMessage: string | null;
  impact: RuleSemanticImpact;
  officialInterpretation: string;
  reasonSummary: string | null;
  refinementQuestions: string[];
  suggestedRewrites: string[];
}

interface AnalyzeRuleSemanticImpactInput {
  ast: RuleAst | null;
  normalizedText: string;
  officialInterpretation: string;
  sourceText: string;
}

interface NumericRange {
  high: number;
  low: number;
}

function normalizeForMatching(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase();
}

function collectRuleSources(ast: RuleAst | null) {
  const sources = new Set<"draw" | "guess">();
  if (!ast) {
    return sources;
  }
  if (ast.schemaVersion === 1) {
    // Every legacy v1 macro compares the player's guess with the draw.
    sources.add("guess");
    sources.add("draw");
    return sources;
  }

  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const record = value as Record<string, unknown>;
    if (
      record.kind === "source" &&
      (record.source === "guess" || record.source === "draw")
    ) {
      sources.add(record.source);
    }
    Object.values(record).forEach(visit);
  };
  visit(ast);
  return sources;
}

function hasBoundedRangeComparisons(ast: RuleAst | null) {
  if (!ast || ast.schemaVersion === 1) {
    return false;
  }
  let hasLowerBound = false;
  let hasUpperBound = false;
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.kind === "compare" || record.kind === "filter_compare") {
      hasLowerBound ||= record.op === "gt" || record.op === "gte";
      hasUpperBound ||= record.op === "lt" || record.op === "lte";
    }
    Object.values(record).forEach(visit);
  };
  visit(ast);
  return hasLowerBound && hasUpperBound;
}

function extractNumericRange(value: string): NumericRange | null {
  const normalized = normalizeForMatching(value);
  const match =
    normalized.match(/\b(?:between|entre)\s+(\d{1,3})\s+(?:and|e)\s+(\d{1,3})\b/u) ??
    normalized.match(/\b(?:from|de)\s+(\d{1,3})\s+(?:to|through|a|ate)\s+(\d{1,3})\b/u);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  const first = Number(match[1]);
  const second = Number(match[2]);
  if (
    !Number.isInteger(first) ||
    !Number.isInteger(second) ||
    first < 1 ||
    second > 100 ||
    first >= second
  ) {
    return null;
  }
  return { high: second, low: first };
}

function getExplicitBoundaryMode(value: string): "exclusive" | "inclusive" | null {
  const normalized = normalizeForMatching(value);
  if (
    /\b(inclusive|including|include|includes|included|through|closed range|incluindo|inclui|inclusiv[ao]s?|pontas? inclusas?|limites? inclusos?)\b/u.test(
      normalized,
    ) ||
    />=|<=/u.test(normalized)
  ) {
    return "inclusive";
  }
  if (
    /\b(exclusive|excluding|exclude|excludes|strictly|open range|excluindo|exclui|sem incluir|pontas? excluidas?|limites? excluidos?)\b/u.test(
      normalized,
    ) ||
    /\bgreater than\b[\s\S]{0,80}\bless than\b/u.test(normalized) ||
    /\bmaior que\b[\s\S]{0,80}\bmenor que\b/u.test(normalized)
  ) {
    return "exclusive";
  }
  return null;
}

function explicitlyConfirmsDrawOnly(value: string) {
  const normalized = normalizeForMatching(value);
  return (
    /\b(?:only|solely|just)\b[^.]{0,70}\b(?:draw|drawn|official numbers?)\b/u.test(normalized) ||
    /\b(?:somente|apenas|so)\b[^.]{0,70}\b(?:sorteio|sorteados?|numeros oficiais)\b/u.test(normalized) ||
    /\b(?:ignore|ignores|ignored|without using|does not use|does not affect|independent of|regardless of)\b[^.]{0,70}\b(?:guess|ticket|pick|chosen numbers?)\b/u.test(normalized) ||
    /\b(?:ignora|ignorar|sem usar|nao usa|nao depende|independente)\b[^.]{0,70}\b(?:palpite|aposta|jogo|numeros escolhidos)\b/u.test(normalized) ||
    /\bnem\b[^.]{0,20}\b(?:olha|usa|use)\b[^.]{0,40}\b(?:palpite|aposta|jogo)\b/u.test(normalized)
  );
}

function explicitlyConfirmsGuessOnly(value: string) {
  const normalized = normalizeForMatching(value);
  return (
    /\b(?:only|solely|just)\b[^.]{0,70}\b(?:guess|ticket|pick|chosen numbers?)\b/u.test(normalized) ||
    /\b(?:somente|apenas|so)\b[^.]{0,70}\b(?:palpite|aposta|jogo|numeros escolhidos)\b/u.test(normalized) ||
    /\b(?:ignore|ignores|ignored|without using|does not use|does not affect|independent of|regardless of)\b[^.]{0,70}\b(?:draw|drawn|official numbers?)\b/u.test(normalized) ||
    /\b(?:ignora|ignorar|sem usar|nao usa|nao depende|independente)\b[^.]{0,70}\b(?:sorteio|sorteados?|numeros oficiais)\b/u.test(normalized)
  );
}

function sentence(value: string) {
  const trimmed = value.trim().replace(/[.\s]+$/u, "");
  return trimmed ? `${trimmed}.` : "";
}

function appendSentence(base: string, addition: string) {
  if (normalizeForMatching(base).includes(normalizeForMatching(addition))) {
    return base;
  }
  return `${sentence(base)} ${addition}`.trim();
}

function buildRangeRewrites(
  range: NumericRange,
  boundaryMode: "exclusive" | "inclusive" | null,
  impact: RuleSemanticImpact,
  normalizedText: string,
) {
  const sourceLabel = impact.sharedOutcome
    ? "official draw"
    : impact.drawIndependent
      ? "guessed"
      : null;
  const scopeSentence = impact.sharedOutcome
    ? "The player's guess does not affect the result."
    : impact.drawIndependent
      ? "The official draw does not affect the result."
      : "";

  if (sourceLabel) {
    const inclusive = `A guess wins if all six ${sourceLabel} numbers are between ${range.low} and ${range.high}, inclusive. ${scopeSentence}`.trim();
    const exclusive = `A guess wins if all six ${sourceLabel} numbers are strictly greater than ${range.low} and strictly less than ${range.high}. ${scopeSentence}`.trim();
    if (boundaryMode === "inclusive") {
      return [inclusive];
    }
    if (boundaryMode === "exclusive") {
      return [exclusive];
    }
    return [inclusive, exclusive];
  }

  const base = sentence(normalizedText);
  if (boundaryMode === "inclusive") {
    return [`${base} The numeric range includes both endpoints.`];
  }
  if (boundaryMode === "exclusive") {
    return [`${base} The numeric range excludes both endpoints.`];
  }
  return [
    `${base} The numeric range includes both endpoints.`,
    `${base} The numeric range excludes both endpoints.`,
  ];
}

export function analyzeRuleSemanticImpact({
  ast,
  normalizedText,
  officialInterpretation,
  sourceText,
}: AnalyzeRuleSemanticImpactInput): RuleSemanticImpactReview {
  const sources = collectRuleSources(ast);
  const usesDraw = sources.has("draw");
  const usesGuess = sources.has("guess");
  const sharedOutcome = usesDraw && !usesGuess;
  const drawIndependent = usesGuess && !usesDraw;
  const numericRange = extractNumericRange(sourceText);
  const boundaryMode = getExplicitBoundaryMode(sourceText);
  const rangeBoundsAmbiguous = Boolean(
    numericRange && hasBoundedRangeComparisons(ast) && !boundaryMode,
  );
  const scopeConfirmationMissing =
    (sharedOutcome && !explicitlyConfirmsDrawOnly(sourceText)) ||
    (drawIndependent && !explicitlyConfirmsGuessOnly(sourceText));
  const confirmationRequired = scopeConfirmationMissing || rangeBoundsAmbiguous;
  const impact: RuleSemanticImpact = {
    drawIndependent,
    rangeBoundsAmbiguous,
    sharedOutcome,
    usesDraw,
    usesGuess,
  };

  const impactNote = sharedOutcome
    ? "Because this condition does not inspect the player's guess, every eligible guess wins or loses together."
    : drawIndependent
      ? "Because this condition does not inspect the official draw, its result is fixed before the draw."
      : "";
  const interpretedWithImpact = impactNote
    ? appendSentence(officialInterpretation, impactNote)
    : officialInterpretation;

  if (!confirmationRequired) {
    return {
      clarityNote: "",
      confirmationRequired: false,
      dealerMessage: null,
      impact,
      officialInterpretation: interpretedWithImpact,
      reasonSummary: null,
      refinementQuestions: [],
      suggestedRewrites: [],
    };
  }

  const refinementQuestions: string[] = [];
  if (scopeConfirmationMissing && sharedOutcome) {
    refinementQuestions.push(
      "Should this rule ignore the player's guess so every eligible guess wins or loses together?",
    );
  }
  if (scopeConfirmationMissing && drawIndependent) {
    refinementQuestions.push(
      "Should this rule ignore the official draw so its result is fixed before the draw?",
    );
  }
  if (rangeBoundsAmbiguous) {
    refinementQuestions.push("Should the numeric range include both endpoints?");
  }

  let suggestedRewrites = numericRange
    ? buildRangeRewrites(
        numericRange,
        rangeBoundsAmbiguous ? null : boundaryMode,
        impact,
        normalizedText,
      )
    : [];
  if (suggestedRewrites.length === 0 && sharedOutcome) {
    suggestedRewrites = [
      appendSentence(
        normalizedText,
        "The player's guess does not affect the result.",
      ),
    ];
  }
  if (suggestedRewrites.length === 0 && drawIndependent) {
    suggestedRewrites = [
      appendSentence(
        normalizedText,
        "The official draw does not affect the result.",
      ),
    ];
  }

  const reasonSummary =
    "Review required: confirm the rule's outcome scope and any numeric range boundaries before payment.";
  const clarityNote = [impactNote, ...refinementQuestions].filter(Boolean).join(" ");
  const dealerMessage = [
    "I compiled the rule, but it needs your confirmation before submission.",
    impactNote,
    rangeBoundsAmbiguous
      ? "The wording also does not say whether the range includes its endpoints."
      : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    clarityNote,
    confirmationRequired: true,
    dealerMessage,
    impact,
    officialInterpretation: interpretedWithImpact,
    reasonSummary,
    refinementQuestions,
    suggestedRewrites,
  };
}
