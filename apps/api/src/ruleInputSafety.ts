import {
  externalDependencyGateText,
  hasExternalDependency,
} from "@tyche/rule-compiler";

const RULE_PREVENTED_PATTERNS = [
  /\b(?:ignore|disregard)\b.{0,40}\b(instructions?|rules?|prompt|polic\w+|safety)\b/i,
  /\b(system|developer)\s+(prompt|message|instruction)\b/i,
  /\bjailbreak\b/i,
  /\bprompt\s*injection\b/i,
  /\b(secretly|silently)\b.{0,60}\bcompile\b.{0,60}\bvalid\b/i,
  /\bhide\b.{0,60}\b(blocked|invalid|rejected)\b/i,
  /\breveal\b.{0,40}\b(prompt|secret|private key|seed phrase)\b/i,
  /\b(?:ignore|ignora|ignorar|desconsidere|desconsiderar)\b.{0,60}\b(?:instrucoes?|regras?|prompt|politicas?|seguranca)\b/i,
  /\b(?:prompt\s+do\s+sistema|mensage(?:m|ns)\s+d[eo]\s+desenvolvedor|instrucoes?\s+d[eo]\s+sistema)\b/i,
  /\b(?:oculte|ocultar|esconda|esconder)\b.{0,60}\b(?:bloquead[oa]s?|invalid[oa]s?|rejeitad[oa]s?)\b/i,
  /\b(?:revele|revelar|mostre|mostrar)\b.{0,60}\b(?:prompt|segredo|chave privada|frase semente)\b/i,
  /\b(?:ignora|ignorar)\b.{0,60}\b(?:instrucciones?|reglas?|prompt|politicas?|seguridad)\b/i,
  /\b(?:prompt\s+del\s+sistema|mensaje\s+del\s+desarrollador|instrucciones?\s+del\s+sistema)\b/i,
  /\b(?:oculta|ocultar|esconde|esconder)\b.{0,60}\b(?:bloquead[oa]s?|invalid[oa]s?|rechazad[oa]s?)\b/i,
  /\b(?:revela|revelar|muestra|mostrar)\b.{0,60}\b(?:prompt|secreto|clave privada|frase semilla)\b/i,
] as const;

const RULE_EXTERNAL_BLOCK_PATTERNS = [
  /\bclosest\b.{0,40}\bamong\s+all\s+players\b/i,
  /\bsol\s+price\b|\busd\b/i,
  /\bx\/twitter\b|\btwitter\b|\bpost\b.{0,40}\blikes?\b/i,
  /\buse\s+python\b|\bimport\s+random\b|\bcode\s+to\s+calculate\b/i,
  /\bfetch\b.{0,80}\bhttps?:\/\//i,
  /\bread\b.{0,40}\blocal\s+file\b|\bsecret\.txt\b/i,
  /\brandomly\s+choose\b.{0,60}\bplayers?\b/i,
  /\bdivisor\s+is\s+zero\b.{0,80}\bruntime\b.{0,40}\bguess\b/i,
  /\breuse\b.{0,40}\bexact\s+rule\b.{0,80}\blast\s+turn\b/i,
  /\bsame\s+rule\b.{0,60}\bdifferent\s+wording\b/i,
] as const;

export type DeterministicRuleSafetyReason =
  | "prompt_injection"
  | "prohibited_external_dependency";

export interface DeterministicRuleSafetyResult {
  decision: "safe" | "unsafe";
  reasons: DeterministicRuleSafetyReason[];
}

export function hasPreventedRulePattern(value: string): boolean {
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return RULE_PREVENTED_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function hasApiExternalRulePattern(value: string): boolean {
  const gateText = externalDependencyGateText(value);
  return RULE_EXTERNAL_BLOCK_PATTERNS.some((pattern) => pattern.test(gateText));
}

/**
 * Pure read-only view of the two deterministic security gates that run before
 * semantic providers in rule preflight. Semantic reviewers may add a block,
 * but can never clear either reason returned here.
 */
export function evaluateDeterministicRuleSafety(
  value: string,
): DeterministicRuleSafetyResult {
  const reasons: DeterministicRuleSafetyReason[] = [];
  if (hasPreventedRulePattern(value)) reasons.push("prompt_injection");
  if (hasApiExternalRulePattern(value) || hasExternalDependency(value)) {
    reasons.push("prohibited_external_dependency");
  }
  return {
    decision: reasons.length > 0 ? "unsafe" : "safe",
    reasons,
  };
}
