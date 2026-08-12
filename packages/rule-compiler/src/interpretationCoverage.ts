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
  /\b(?:between|entre|from|de)\s+(\d{1,3})\s+(?:and|e|to|through|a|ate)\s+(\d{1,3})\b/gu;

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

function stripVacuousRanges(value: string) {
  return value.replace(FULL_DOMAIN_RANGE, (match, low: string, high: string) => {
    const lowValue = Number(low);
    const highValue = Number(high);
    const coversDomain =
      Number.isInteger(lowValue) &&
      Number.isInteger(highValue) &&
      lowValue <= NUMBER_DOMAIN_MIN &&
      highValue >= NUMBER_DOMAIN_MAX;
    return coversDomain ? " " : match;
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
