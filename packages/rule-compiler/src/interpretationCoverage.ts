import type { RuleAst } from "@tyche/rule-schema";

// Consistency gate (PRD §6.5 / §6.10): the frozen artifact is what pays the
// prize, but the player only ever reads prose. When the compiler drops a
// constraint the player wrote, both the AST and the official interpretation
// silently describe a DIFFERENT rule than the one on the card — turn 55 shipped
// "guess is exactly {1,2,3,4,5,6} and a drawn number is in [1,99]" as
// `count(guess ∩ draw) == 6`, so nobody could win what the card promised.
//
// The check is deterministic and one-directional: every numeric constraint AND
// every load-bearing operation the player stated explicitly must survive into
// the compiled AST and into the interpretation shown back to them. It never asks
// the reverse (an AST may legitimately carry values or operations the prose does
// not spell out).
//
// Operations are checked because values alone are not enough: "the guessed sum
// modulo 9 equals the drawn sum modulo 9" compiled to plain `sum_equals` with
// every literal intact, and "exactly three odd guessed numbers and three odd
// drawn numbers" compiled to a bare match count. Both kept their numbers and
// both froze a different rule.

export interface InterpretationCoverage {
  covered: boolean;
  missingFromAst: number[];
  missingFromInterpretation: number[];
  missingOperations: RuleOperation[];
  requiredOperations: RuleOperation[];
  requiredValues: number[];
}

/**
 * Load-bearing operations a player can name explicitly. Deliberately a small
 * closed set: each one changes which guesses win, each one has an unambiguous
 * signature in the AST, and none of them can be "simplified away" the way a
 * count or a position can.
 */
export type RuleOperation = "digit" | "mod" | "parity" | "sum";

export interface InterpretationCoverageInput {
  ast: RuleAst;
  officialInterpretation: string;
  text: string;
}

// Word forms that a model may use in prose where the player wrote a digit.
// Applied ONLY when reading the covering side (AST / interpretation), never
// when collecting requirements — see collectRequiredValues.
const NUMBER_WORD_VALUES = new Map<string, number>([
  ["zero", 0],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["um", 1],
  ["uma", 1],
  ["dois", 2],
  ["duas", 2],
  ["tres", 3],
  ["quatro", 4],
  ["cinco", 5],
  ["seis", 6],
  ["sete", 7],
  ["oito", 8],
  ["nove", 9],
  ["dez", 10],
]);

// An illustration is not a constraint: "por exemplo, se sair 12 31 24" must not
// require 12/31/24 to appear in the AST. Cut from the marker to the end of its
// sentence.
const EXAMPLE_MARKERS =
  /\b(?:for example|for instance|e\.?g\.?|such as|por exemplo|exemplo|ex\.?:)/u;

// Only value-level literals are required to survive compilation: the specific
// numbers a guess or draw must contain, and the bounds of an explicit numeric
// range. Counts, thresholds, positions and budgets are deliberately NOT
// required — a compiler may legitimately simplify them away. "Remove the 2
// worst guesses, then win if 3 of the rest match" is provably the same rule as
// "win if at least 3 match" (removal never discards a matching number while a
// non-matching one remains), and a 1-based position in prose maps to a 0-based
// index in the AST, so neither literal can be compared directly.
//
// A dropped VALUE literal has no such excuse: it always changes which guesses
// win, which is exactly how turn 55 shipped a rule nobody could win.
const BRACED_SET = /[{[]([^}\]]*)[}\]]/gu;
const NUMBER_ENUMERATION =
  /\b\d{1,3}(?:\s*(?:,|;|\band\b|\be\b|\bor\b|\bou\b|\s)\s*\d{1,3}){2,}\b/gu;
const MEMBERSHIP_ENUMERATION =
  /\b(?:contains?|includes?|contem|inclui)\s+(?:(?:the|os|as)\s+)?(?:numbers?|numeros?|dezenas?)?\s*(\d{1,3}(?:\s*(?:[,;]\s*(?:(?:and|e)\s+)?|(?:and|e)\s+|\s+)\d{1,3})+)\b/gu;
const NUMERIC_RANGE =
  /\b(?:between|entre)\s+(\d{1,3})\s+(?:and|e)\s+(\d{1,3})\b|\b(?:from|de)\s+(\d{1,3})\s+(?:to|through|a|ate)\s+(\d{1,3})\b/gu;

// "contains the number 13" states a membership requirement, and dropping it
// always changes which guesses win — unlike a count or a threshold, there is no
// equivalent rewrite that omits it. The lookahead keeps counts out: "contains 3
// numbers" is a count, not a value.
const MEMBERSHIP_LITERAL =
  /\b(?:contains?|includes?|contem|inclui)\s+(?:the\s+number\s+|o\s+numero\s+|a\s+dezena\s+)?(\d{1,3})\b(?!\s*(?:numbers?|numeros?|matches|hits|acertos?|dezenas?|of\b|or\s+more))/gu;

// A range that already covers the whole number domain constrains nothing, so a
// compiler that drops it loses no meaning. [1, 99] is NOT such a range (it
// excludes 100), which is why the turn-55 rule still has to carry its bounds.
const FULL_DOMAIN_RANGE =
  /\b(?:between|entre|from|de)\s+\d{1,3}\s+(?:and|e|to|through|a|ate)\s+\d{1,3}\b|\b\d{1,3}\s*[-\u2010-\u2015]\s*\d{1,3}\b/gu;

const NUMBER_DOMAIN_MIN = 1;
const NUMBER_DOMAIN_MAX = 100;

const COMBINING_MARKS = /[̀-ͯ]/gu;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase();
}

function stripExampleClauses(value: string) {
  return value
    .split(/(?<=[.;])\s+/u)
    .map((part) => {
      const marker = part.search(EXAMPLE_MARKERS);
      return marker === -1 ? part : part.slice(0, marker);
    })
    .join(" ");
}

export function stripVacuousRanges(value: string) {
  return value.replace(FULL_DOMAIN_RANGE, (match) => {
    const bounds = readDigits(match);
    if (bounds.length !== 2) {
      return match;
    }
    const [low, high] = bounds as [number, number];
    return low <= NUMBER_DOMAIN_MIN && high >= NUMBER_DOMAIN_MAX ? " " : match;
  });
}

function readDigits(value: string) {
  return (value.match(/\d+/gu) ?? [])
    .map((digits) => Number(digits))
    .filter((parsed) => Number.isSafeInteger(parsed));
}

/**
 * The value-level numbers the player stated: members of an explicit set of
 * numbers, and the bounds of an explicit numeric range. Spelled-out words are
 * ignored — "all six numbers" describes the ticket shape, not a value.
 */
export function collectRequiredValues(text: string): number[] {
  const prepared = stripVacuousRanges(stripExampleClauses(normalize(text)));
  const required = new Set<number>();

  for (const [, inner] of prepared.matchAll(BRACED_SET)) {
    readDigits(inner ?? "").forEach((value) => required.add(value));
  }
  for (const [enumeration] of prepared.matchAll(NUMBER_ENUMERATION)) {
    readDigits(enumeration).forEach((value) => required.add(value));
  }
  for (const [, enumeration] of prepared.matchAll(MEMBERSHIP_ENUMERATION)) {
    readDigits(enumeration ?? "").forEach((value) => required.add(value));
  }
  for (const match of prepared.matchAll(NUMERIC_RANGE)) {
    readDigits(match[0]).forEach((value) => required.add(value));
  }
  for (const [, literal] of prepared.matchAll(MEMBERSHIP_LITERAL)) {
    readDigits(literal ?? "").forEach((value) => required.add(value));
  }

  return [...required].sort((a, b) => a - b);
}

function collectProseValues(text: string): Set<number> {
  const prepared = normalize(text);
  const values = new Set(readDigits(prepared));
  for (const [word, value] of NUMBER_WORD_VALUES) {
    if (new RegExp(`\\b${word}\\b`, "u").test(prepared)) {
      values.add(value);
    }
  }
  return values;
}

/**
 * Every number reachable in the AST, wherever it sits (literals, thresholds,
 * moduli, guards, indices). Over-inclusive on purpose: this is the covering
 * side, so a broader set can only reduce false rejections. `schemaVersion` is
 * skipped — it is metadata, and counting it would let a v1 artifact "cover" a
 * required 1.
 */
export function collectAstValues(ast: RuleAst): Set<number> {
  const values = new Set<number>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (typeof node === "number") {
      if (Number.isSafeInteger(node)) {
        values.add(node);
      }
      return;
    }
    if (!node || typeof node !== "object") {
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "schemaVersion") {
        continue;
      }
      visit(value);
    }
  };
  visit(ast);
  return values;
}

// A dropped VALUE is not the only way a compile can promise one rule and freeze
// another. "the guessed sum modulo 9 equals the drawn sum modulo 9" compiled to
// plain `sum_equals` and "exactly three odd guessed numbers AND three odd drawn
// numbers" compiled to a bare match count — in both cases every literal the
// player wrote survived, so value coverage saw nothing wrong, while the frozen
// rule was a different rule.
//
// These cues are matched one-directionally, exactly like values: an AST may use
// an operation the prose does not name, never the reverse. "even if" and "even
// though" are excluded because they are conjunctions, not parity.
const OPERATION_TEXT_CUES: ReadonlyArray<readonly [RuleOperation, RegExp]> = [
  ["mod", /\b(?:modulo|modulus|mod|remainder|resto)\b/u],
  [
    "parity",
    /\b(?:even(?!\s+(?:if|though|when|so))|odd|numeros?\s+pares?|pares|impar(?:es)?)\b/u,
  ],
  ["sum", /\b(?:sum|sums|total|totals|soma|somam?)\b/u],
  ["digit", /\b(?:digit|digits|digito|digitos)\b/u],
];

export function collectRequiredOperations(text: string): RuleOperation[] {
  const prepared = stripExampleClauses(normalize(text));
  return OPERATION_TEXT_CUES.filter(([, pattern]) => pattern.test(prepared)).map(
    ([operation]) => operation,
  );
}

function readLiteral(node: unknown): number | null {
  if (!node || typeof node !== "object") {
    return null;
  }
  const record = node as Record<string, unknown>;
  return record.kind === "lit" && typeof record.value === "number"
    ? record.value
    : null;
}

/**
 * Operations the AST actually performs. Over-inclusive on purpose (this is the
 * covering side), so a broader reading can only reduce false rejections.
 */
export function collectAstOperations(ast: RuleAst): Set<RuleOperation> {
  const operations = new Set<RuleOperation>();
  if (ast.schemaVersion === 1) {
    if (ast.node.kind === "sum_equals") {
      operations.add("sum");
    }
    return operations;
  }

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") {
      return;
    }
    const record = node as Record<string, unknown>;
    const kind = typeof record.kind === "string" ? record.kind : "";
    const op = typeof record.op === "string" ? record.op : "";

    if (kind.includes("digit") || kind === "digits") {
      operations.add("digit");
    }
    // A modulus is not just "modulo": mod 2 IS a parity test and mod 10 IS the
    // units digit. Players write it both ways ("the last digit of the totals
    // matters: my sum modulo 10 ..."), so one arithmetic node has to satisfy
    // every cue it genuinely implements, or correct compiles get rejected.
    const modulus =
      typeof record.operand === "number"
        ? record.operand
        : readLiteral(record.right);
    if (kind === "filter_mod" || op === "mod") {
      operations.add("mod");
      const value = kind === "filter_mod" ? record.modulus : modulus;
      if (value === 2) {
        operations.add("parity");
      }
      if (value === 10) {
        operations.add("digit");
      }
    }
    // `total_ordered_abs_diff_lte` adds up per-position differences: a total is
    // a sum, whatever the node is called.
    if (op === "sum" || kind.includes("sum") || kind.includes("total")) {
      operations.add("sum");
    }
    Object.values(record).forEach(visit);
  };
  visit(ast);
  return operations;
}

export function analyzeInterpretationCoverage({
  ast,
  officialInterpretation,
  text,
}: InterpretationCoverageInput): InterpretationCoverage {
  const requiredValues = collectRequiredValues(text);
  const astValues = collectAstValues(ast);
  const interpretationValues = collectProseValues(officialInterpretation);
  const missingFromAst = requiredValues.filter(
    (value) => !astValues.has(value),
  );
  const missingFromInterpretation = requiredValues.filter(
    (value) => !interpretationValues.has(value),
  );

  const requiredOperations = collectRequiredOperations(text);
  const astOperations = collectAstOperations(ast);
  const missingOperations = requiredOperations.filter(
    (operation) => !astOperations.has(operation),
  );

  return {
    covered:
      missingFromAst.length === 0 &&
      missingFromInterpretation.length === 0 &&
      missingOperations.length === 0,
    missingFromAst,
    missingFromInterpretation,
    missingOperations,
    requiredOperations,
    requiredValues,
  };
}

// ---------------------------------------------------------------------------
// Statement fidelity: the headline sentence vs the frozen artifact.
//
// Coverage above answers "did the player's numbers and operations survive into
// the AST?". This answers the other half, and it is the half that reaches the
// player: the sentence printed on the rule card — and hashed into
// `normalizedTextHash` on-chain — is MODEL PROSE, not a rendering of the AST.
// Nothing tied the two together beyond their numbers, so a model could keep
// every literal and still change the claim with a single quantifier. Turn 57
// shipped "contains EXACTLY the numbers 1, 2, 3 and 4 (and two other numbers
// from 5 through 100)" over an AST that merely requires the guess to INCLUDE
// those four — the card asserts set equality over four values while the ticket
// always holds six, so it is not even self-consistent, and a voter reading it
// is voting on a rule that does not exist.
//
// The check is deliberately one-directional and narrow, exactly like the cues
// above: prose may say LESS than the AST, never MORE. And unlike coverage, an
// unsupported claim is not the player's fault — they did not write the
// sentence — so the remedy is to replace the prose with the AST-derived
// description, never to reject the rule.

/** Claims a statement can make that the artifact has to back. */
export type RuleStatementClaim = "exclusive_guess_set";

export interface StatementFidelity {
  faithful: boolean;
  unsupportedClaims: RuleStatementClaim[];
}

const TICKET_SIZE = 6;

// "exactly / only / just THESE numbers" — the cue has to introduce the
// enumeration itself, not merely share a sentence with it. Anchoring matters:
// "includes 1, 2, 3 and the sum is exactly 100" enumerates values and contains
// an exclusivity word, but claims exclusivity over neither, and treating it as a
// set claim would replace a perfectly faithful headline with a clumsier one.
const EXCLUSIVE_SET_CLAIM =
  /\b(?:exactly|only|precisely|solely|just|apenas|somente|exatamente)\s+(?:the\s+|os\s+|as\s+)?(?:numbers?|values?|numeros?|dezenas?|set\s+of\s+)?\s*(\d{1,3}(?:\s*(?:[,;]\s*(?:(?:and|e|or|ou)\s+)?|(?:and|e|or|ou)\s+|\s+)\d{1,3})+)/gu;

/**
 * Values the AST pins onto the guess by membership (`contains(guess, <lit>)`).
 * A guess holds six distinct numbers, so pinning all six IS set equality — that
 * is the only shape in which an artifact genuinely claims exclusivity.
 */
export function collectGuessPinnedValues(ast: RuleAst): Set<number> {
  const pinned = new Set<number>();
  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!node || typeof node !== "object") {
      return;
    }
    const record = node as Record<string, unknown>;
    const array = record.array as Record<string, unknown> | undefined;
    const value = record.value as Record<string, unknown> | undefined;
    if (
      record.kind === "contains" &&
      array?.kind === "source" &&
      array.source === "guess" &&
      value?.kind === "lit" &&
      typeof value.value === "number"
    ) {
      pinned.add(value.value);
    }
    Object.values(record).forEach(visit);
  };
  visit(ast);
  return pinned;
}

/** Does the statement assert that a ticket is exactly some enumerated set? */
function claimsExclusiveSet(statement: string): null | number[] {
  const prepared = stripExampleClauses(normalize(statement));
  for (const [, enumeration] of prepared.matchAll(EXCLUSIVE_SET_CLAIM)) {
    const enumerated = readDigits(enumeration ?? "");
    if (enumerated.length > 0) {
      return [...new Set(enumerated)].sort((a, b) => a - b);
    }
  }
  return null;
}

/**
 * Whether the headline statement may be shown as-is, or must be replaced by the
 * AST-derived description. Never a rejection: see the note above.
 */
export function analyzeStatementFidelity({
  ast,
  statement,
}: {
  ast: RuleAst;
  statement: string;
}): StatementFidelity {
  const unsupportedClaims: RuleStatementClaim[] = [];
  const exclusiveSet = claimsExclusiveSet(statement);
  if (exclusiveSet !== null) {
    const pinned = collectGuessPinnedValues(ast);
    // Exclusivity holds only when the artifact pins a full ticket AND pins the
    // very values the sentence enumerates. A claim over fewer than six values
    // fails on the first test and is self-contradictory on its own terms.
    const backed =
      exclusiveSet.length === TICKET_SIZE &&
      pinned.size === TICKET_SIZE &&
      exclusiveSet.every((value) => pinned.has(value));
    if (!backed) {
      unsupportedClaims.push("exclusive_guess_set");
    }
  }
  return { faithful: unsupportedClaims.length === 0, unsupportedClaims };
}
