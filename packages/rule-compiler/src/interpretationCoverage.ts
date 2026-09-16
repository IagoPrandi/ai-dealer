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
 * signature in the AST, and none of them can be "simplified away".
 *
 * `position` was added after a rule reading "the guess that most matches wins;
 * otherwise the smallest difference in the corresponding POSITIONS" compiled to
 * a bare unordered match count. Every literal survived (the text had none) and
 * every operation in the old four-item set survived (it named none), so the gate
 * certified an artifact that had dropped the whole second criterion. An
 * operation missing from this set is a clause the gate cannot see.
 *
 * "difference" is deliberately NOT a member, though the same rule names one.
 * Membership requires that the operation can never be legitimately simplified
 * away, and a difference can: "remove up to 2 guessed numbers with the largest
 * absolute DIFFERENCE from any drawn number, then win if 3 remaining guessed
 * numbers appear in the draw" compiles — correctly — to a plain match count,
 * because the removed numbers are by definition not in the draw and so cannot
 * change the count. Requiring a subtraction node there would reject a faithful
 * artifact. `position` carries the same rule's intent and has no such escape:
 * an unordered count can never stand in for a positional comparison.
 */
export type RuleOperation =
  | "adjacent_gap"
  | "all_draw"
  | "all_guess"
  | "comparison_count"
  | "comparison_exists"
  | "conditional"
  | "digit"
  | "distance"
  | "distinct"
  | "exclusive_disjunction"
  | "exists_draw"
  | "exists_guess"
  | "maximum"
  | "membership"
  | "minimum"
  | "mod"
  | "nearest_each"
  | "parity"
  | "position"
  | "product"
  | "ranking"
  | "scalar_add"
  | "set_equality"
  | "sort"
  | "sum";

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
  /\b\d{1,3}(?:\s*(?:[,;]\s*(?:(?:and|or|e|ou)\s+)?|(?:and|or|e|ou)\s+|\s+)\d{1,3}){2,}\b/gu;
const MEMBERSHIP_ENUMERATION =
  /\b(?:contains?|includes?|contem|inclui)\s+(?:(?:the|os|as)\s+)?(?:numbers?|numeros?|dezenas?)?\s*(\d{1,3}(?:\s*(?:[,;]\s*(?:(?:and|e)\s+)?|(?:and|e)\s+|\s+)\d{1,3})+)\b/gu;
const NUMERIC_RANGE =
  /\b(?:between|entre)\s+(\d{1,3})\s+(?:and|e)\s+(\d{1,3})\b|\b(?:from|de)\s+(\d{1,3})\s+(?:to|through|a|ate)\s+(\d{1,3})\b/gu;

// Thresholds attached to a measurable comparison are values too. Counts and
// positions may legitimately compile away ("at least one" -> `exists`, first
// -> index 0), but a distance/gap boundary cannot: changing or dropping it
// changes the winner set. Keep this deliberately shape-based rather than
// harvesting every number in prose, which would re-introduce the old false
// rejection of safely simplified counts.
const COMPARISON_THRESHOLD_PATTERNS = [
  /\bwithin\s+(\d{1,3})\s+(?:of|from)\b/gu,
  /\b(?:distance|difference)\s+(?:of|is)\s+(\d{1,3})\b/gu,
  /\b(\d{1,3})\s+(?:away|apart|below|above|lower|higher)\b/gu,
  /\b(?:gap|gaps|distance|distances|difference|differences)\b[^.;:]{0,60}\b(?:at\s+least|at\s+most|more\s+than|less\s+than|greater\s+than|no\s+more\s+than|no\s+less\s+than)\s+(\d{1,3})\b/gu,
  /\b(?:below|above|under|over|lower\s+than|higher\s+than|less\s+than|greater\s+than|smaller\s+than|larger\s+than)\s+(\d{1,3})\b/gu,
  /\b(?:a\s+no\s+maximo|distancia\s+(?:de|e)|diferenca\s+(?:de|e))\s+(\d{1,3})\b/gu,
  /\b(\d{1,3})\s+(?:de\s+distancia|abaixo|acima|menor|maior)\b/gu,
] as const;

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
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase();
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

/**
 * Placeholder left where a vacuous range was, so a caller can still tell WHICH
 * clause the range came from after the text has been split into clauses.
 * Splitting first is not an option: every clause boundary candidate ("and") also
 * appears inside a range ("between 1 and 100"), so the split would cut the range
 * in half and nothing would look vacuous any more.
 * Tildes on purpose: not a word character (so the token can neither create
 * nor hide a cue), not a clause boundary, and visible in a debugger — unlike a
 * control character, which is invisible in source and easy to mangle in transit.
 */
const VACUOUS_RANGE_MARK = "~~";

function replaceVacuousRanges(value: string, replacement: string) {
  return value.replace(FULL_DOMAIN_RANGE, (match) => {
    const bounds = readDigits(match);
    if (bounds.length !== 2) {
      return match;
    }
    const [low, high] = bounds as [number, number];
    return low <= NUMBER_DOMAIN_MIN && high >= NUMBER_DOMAIN_MAX
      ? replacement
      : match;
  });
}

export function stripVacuousRanges(value: string) {
  return replaceVacuousRanges(value, " ");
}

function readDigits(value: string) {
  return (value.match(/\d+/gu) ?? [])
    .map((digits) => Number(digits))
    .filter((parsed) => Number.isSafeInteger(parsed));
}

function readNamedInteger(value: string): number | null {
  const digit = Number(value);
  if (Number.isSafeInteger(digit)) {
    return digit;
  }
  return NUMBER_WORD_VALUES.get(value) ?? null;
}

/**
 * A complete residue domain is an explanation of modulo, not a set of values
 * the rule compares against. For example, modulo four necessarily produces
 * one of 0, 1, 2, or 3; requiring those four literals in the AST rejects the
 * canonical `value mod 4` encoding even though it preserves the rule exactly.
 *
 * This is semantic rather than phrase-specific: the enumeration must be the
 * complete contiguous domain 0..m-1, the surrounding clause must identify it
 * as remainders/residues, and that same clause must state modulus/divisor m.
 * Partial domains and enumerations attached to a different divisor remain
 * load-bearing.
 */
function isCompleteResidueDomainEnumeration(
  prepared: string,
  index: number,
  enumeration: string,
) {
  // NUMBER_ENUMERATION can stop before a final Oxford-comma conjunction
  // (`0, 1, 2, or 3`). Expand from the same starting point before deciding
  // whether the list is the full residue domain.
  const expanded = prepared
    .slice(index, index + 120)
    .match(
      /^\d{1,3}(?:\s*(?:[,;]\s*(?:(?:and|or|e|ou)\s+)?|(?:and|or|e|ou)\s+|\s+)\d{1,3}){2,}/u,
    )?.[0];
  const values = [...new Set(readDigits(expanded ?? enumeration))].sort(
    (a, b) => a - b,
  );
  if (
    values.length < 2 ||
    values[0] !== 0 ||
    values.some((value, valueIndex) => value !== valueIndex)
  ) {
    return false;
  }

  const modulus = values.length;
  const context = prepared.slice(
    Math.max(0, index - 80),
    Math.min(prepared.length, index + (expanded ?? enumeration).length + 180),
  );
  if (!/\b(?:remainders?|residue(?:s|\s+classes)?|restos?)\b/u.test(context)) {
    return false;
  }

  const divisorPattern =
    /\b(?:mod(?:ulo)?|modulus|divid(?:e|ed|ing)?[^.;:]{0,80}?\bby|dividid[oa]s?[^.;:]{0,80}?\bpor)\s+(\d{1,3}|[a-z]+)\b/gu;
  return [...context.matchAll(divisorPattern)].some(
    (match) => readNamedInteger(match[1] ?? "") === modulus,
  );
}

// A range stated over the numbers a rule has NOT already pinned is vacuous in
// exactly the same way a 1..100 range is, and for the same reason: a ticket
// holds six distinct values from 1..100, so once 1, 2, 3 and 4 are pinned the
// other two are necessarily in 5..100. Requiring those bounds to survive into
// the AST put such a rule in a dead end with no way out: a faithful compile
// omits the redundant bounds and fails coverage (INTERPRETATION_MISMATCH),
// while a compile that keeps them as a constraint over the WHOLE guess
// contradicts the pinned values and is rejected as IMPOSSIBLE. Two providers
// picking the two readings is also a PROVIDER_DISAGREEMENT, which reports the
// fault as a compiler conflict the player is told not to fix — so the rule could
// never be frozen however it was reworded.
//
// Narrow on purpose. The range must be introduced as covering the REMAINING
// numbers, the pinned values must fill 1..low-1 with no gap, and the upper bound
// must reach the top of the domain. "the guess contains 1, 2, 3, 4 and all six
// numbers are between 5 and 100" carries no remainder cue, so its bounds stay
// required — that rule really is self-contradictory and must be reported as
// such, not silently relaxed into a different rule.
const REMAINDER_SCOPE =
  /\b(?:remaining|other|others|additional|extra|extras|rest|final|last|restantes?|adicionais?|demais|resto|outr[oa]s?|ultim[oa]s?)\b/u;

const CLAUSE_BOUNDARIES = [".", ";", ",", ":"] as const;

/** Is the range at `index` introduced as constraining the leftover numbers? */
function isRemainderScopedRange(prepared: string, index: number) {
  const clauseStart = Math.max(
    ...CLAUSE_BOUNDARIES.map((mark) => prepared.lastIndexOf(mark, index)),
  );
  return REMAINDER_SCOPE.test(prepared.slice(clauseStart + 1, index));
}

/** A range over positions or a bound index is not a range of ticket values. */
function isPositionIndexRange(prepared: string, index: number) {
  return /\b(?:positions?|indices|indexes|slots?|index|[ij])\s*(?:numbered|indexed|running)?\s*$/u.test(
    prepared.slice(Math.max(0, index - 36), index),
  );
}

/**
 * Does `[low, high]` cover exactly what is left of the domain once `pinned` is
 * removed? Only a gapless block from 1 counts: with 2 and 4 pinned, "the others
 * between 5 and 100" genuinely excludes 1 and 3, so its bounds are load-bearing.
 */
function coversRemainingDomain(bounds: number[], pinned: ReadonlySet<number>) {
  if (bounds.length !== 2) {
    return false;
  }
  const [low, high] = bounds as [number, number];
  if (low <= NUMBER_DOMAIN_MIN || high < NUMBER_DOMAIN_MAX) {
    return false;
  }
  for (let value = NUMBER_DOMAIN_MIN; value < low; value += 1) {
    if (!pinned.has(value)) {
      return false;
    }
  }
  return true;
}

/**
 * The value-level numbers the player stated: members of an explicit set of
 * numbers, and the bounds of an explicit numeric range. Spelled-out words are
 * ignored — "all six numbers" describes the ticket shape, not a value.
 */
export function collectRequiredValues(text: string): number[] {
  const prepared = stripVacuousRanges(stripExampleClauses(normalize(text)));
  const required = new Set<number>();

  for (const match of prepared.matchAll(BRACED_SET)) {
    const inner = match[1] ?? "";
    // `guess[1]` and `draw[6]` select positions. The bracketed numeral is an
    // index, not a value that must occur in the ticket or AST. An adjacent
    // identifier makes this unambiguous; free-standing `[1, 2, 3]` remains a
    // literal value set.
    if (
      match[0].startsWith("[") &&
      match.index !== undefined &&
      /[a-z0-9_]$/u.test(prepared.slice(0, match.index))
    ) {
      continue;
    }
    if (
      match.index === undefined ||
      !isCompleteResidueDomainEnumeration(prepared, match.index, inner)
    ) {
      readDigits(inner).forEach((value) => required.add(value));
    }
  }
  for (const match of prepared.matchAll(NUMBER_ENUMERATION)) {
    const enumeration = match[0];
    if (
      match.index === undefined ||
      !isCompleteResidueDomainEnumeration(prepared, match.index, enumeration)
    ) {
      readDigits(enumeration).forEach((value) => required.add(value));
    }
  }
  for (const [, enumeration] of prepared.matchAll(MEMBERSHIP_ENUMERATION)) {
    readDigits(enumeration ?? "").forEach((value) => required.add(value));
  }
  for (const [, literal] of prepared.matchAll(MEMBERSHIP_LITERAL)) {
    readDigits(literal ?? "").forEach((value) => required.add(value));
  }
  for (const pattern of COMPARISON_THRESHOLD_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of prepared.matchAll(pattern)) {
      readDigits(match[1] ?? "").forEach((value) => required.add(value));
    }
  }

  // Ranges are read last: whether a range constrains anything at all depends on
  // the values pinned above, so the pinned set has to be complete first.
  const pinned = new Set(required);
  for (const match of prepared.matchAll(NUMERIC_RANGE)) {
    const bounds = readDigits(match[0]);
    if (
      match.index !== undefined &&
      isPositionIndexRange(prepared, match.index)
    ) {
      continue;
    }
    if (
      match.index !== undefined &&
      isRemainderScopedRange(prepared, match.index) &&
      coversRemainingDomain(bounds, pinned)
    ) {
      continue;
    }
    bounds.forEach((value) => required.add(value));
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
        values.add(Math.abs(node));
      }
      return;
    }
    if (!node || typeof node !== "object") {
      return;
    }
    for (const [key, value] of Object.entries(
      node as Record<string, unknown>,
    )) {
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
  // Selection by an extreme across tickets is a ranking, not a per-ticket
  // qualification predicate. Preserve that result type before a deterministic
  // match-count shortcut can suppress the provider compilation path.
  [
    "ranking",
    /\bamong\s+(?:(?:all|the|eligible|qualifying|remaining|those)\s+)*(?:tickets|guesses|entries)\b[^.;:]{0,180}\b(?:smallest|largest|lowest|highest|minimum|maximum|minimal|maximal|fewest|most)\s+(?:(?:numeric|total|absolute)\s+)?(?:range|span|score|sum|total|count|distance|difference|matches|hits)\b|\b(?:ticket|guess|entry)\s+with\s+the\s+(?:smallest|largest|lowest|highest|minimum|maximum|minimal|maximal|fewest|most)\s+(?:(?:numeric|total|absolute)\s+)?(?:range|span|score|sum|total|count|distance|difference|matches|hits)\b[^.;:]{0,60}\bwins?\b/u,
  ],
  [
    "all_draw",
    /\b(?:all|every|each)(?:\s+one)?(?:\s+value)?\s+(?:of\s+)?(?:the\s+)?(?:official\s+)?(?:drawn|draw)\s+(?:numbers?|values?)\b[^.;:]{0,80}\b(?:within|away|distance|satisf(?:y|ies)|for\s+each|every|at\s+least\s+one)\b/u,
  ],
  [
    "all_guess",
    /\b(?:all|every|each)(?:\s+one)?(?:\s+value)?\s+(?:of\s+)?(?:its|my|your|the)?\s*(?:guessed|picked|ticket)?\s*(?:numbers?|values?|picks?)\b[^.;:]{0,80}\b(?:within|away|distance|satisf(?:y|ies)|for\s+each|every|at\s+least\s+one|worth|scores?|earns?|vale(?:m)?)\b/u,
  ],
  [
    "distance",
    /\b(?:distance|distances|away|apart)\b|\bwithin\s+\d{1,3}\s+(?:of|from)\b|\b(?:add|sum|total)\b[^.;:]{0,50}\bdifferences?\b|\bdifferences?\b[^.;:]{0,50}\b(?:add|sum|total)\b/u,
  ],
  [
    "distinct",
    /\b(?:gaps?|distances?|digits?|remainders?|derived\s+values?)\b[^.;:]{0,50}\b(?:all\s+different|distinct|unique)\b|\b(?:all\s+different|distinct|unique)\b[^.;:]{0,50}\b(?:gaps?|distances?|digits?|remainders?|derived\s+values?)\b/u,
  ],
  [
    "membership",
    /\b(?:appear(?:s|ed|ing)?\s+in|present\s+in|contained?\s+in|(?:contains?|includes?|holds?)\s+(?:(?:at\s+least|exactly|any)\s+)?(?:one\s+of\s+)?(?:the\s+)?(?:numbers?|values?|drawn)|one\s+of\s+the\s+drawn|intersection|overlap)\b/u,
  ],
  [
    "minimum",
    /\b(?:smallest|lowest|minimum|minimo)\s+(?:drawn|guessed|picked|ticket)?\s*(?:number|value|gap)|\b(?:numero|valor|lacuna)\s+(?:minimo|menor)\b/u,
  ],
  [
    "maximum",
    /\b(?:largest|highest|biggest|maximum|maximo)\s+(?:drawn|guessed|picked|ticket)?\s*(?:number|value|gap)|\b(?:numero|valor|lacuna)\s+(?:maximo|maior)\b/u,
  ],
  [
    "sort",
    /\b(?:sort(?:ed|ing)?|ordenad[oa]s?|lowest\s+to\s+highest|highest\s+to\s+lowest)\b/u,
  ],
  [
    "adjacent_gap",
    /\b(?:gaps?|distances?)\s+between\s+(?:consecutive|adjacent)|\b(?:consecutive|adjacent)\s+(?:gaps?|numbers?)\b/u,
  ],
  // A quantified list of boolean comparisons is not a conjunction. Losing the
  // count changes "at least four of five" into "all comparisons", or into the
  // handful a regex happened to enumerate. Keep this as its own operation so
  // every parser/provider must preserve the aggregation, not just the
  // underlying positional comparisons.
  [
    "comparison_count",
    /\b(?!(?:at\s+least|no\s+fewer\s+than|pelo\s+menos|no\s+minimo)\s+(?:1|one|um|uma)\b)(?:at\s+least|at\s+most|exactly|no\s+fewer\s+than|no\s+more\s+than|pelo\s+menos|no\s+minimo|no\s+maximo|exatamente)\s+(?:[0-6]|zero|one|two|three|four|five|six|um|uma|dois|duas|tres|quatro|cinco|seis)\b[^.;:]{0,80}\bcompar(?:ison|isons|acao|acoes|acoes)\b/u,
  ],
  [
    "comparison_exists",
    /\b(?:at\s+least|no\s+fewer\s+than|pelo\s+menos|no\s+minimo)\s+(?:1|one|um|uma)\b[^.;:]{0,80}\b(?:compar(?:ison|isons|acao|acoes)\b|(?:mirrored\s+|paired\s+)?pairs?\b[^.;:]{0,60}\b(?:same|equal|match(?:es|ing)?|holds?|igual|iguais|coincid\w*)\b)/u,
  ],
  [
    "exclusive_disjunction",
    /\b(?:exactly|only)\s+one\s+of\s+(?:(?:these|the)\s+)?(?:two\s+)?(?:statements?|conditions?|clauses?)\s+is\s+true\b|\b(?:one|either)\b[^.;:]{0,120}\b(?:but\s+not\s+both|not\s+both)\b/u,
  ],
  ["mod", /\b(?:modulo|modulus|mod|remainder|resto)\b/u],
  [
    "nearest_each",
    /\b(?:distance|difference)\s+(?:from|to)\s+(?:whichever\s+)?(?:the\s+)?(?:drawn|guessed)?\s*(?:number|value)?\s*(?:is\s+)?(?:nearest|closest)\b|\b(?:nearest|closest)\s+(?:drawn|guessed)\s+(?:number|value)\b/u,
  ],
  [
    "parity",
    /\b(?:even(?!\s+(?:if|though|when|so))|odd|numeros?\s+pares?|pares|impar(?:es)?)\b/u,
  ],
  // "final total" names the result of scalar arithmetic, not a reduction
  // over ticket values.
  ["sum", /\b(?:sum|sums|total|totals|soma|somam?)\b/u],
  [
    "product",
    /\b(?:product|multiply|multiplied|multiplication|double[ds]?|doubling|twice|triple[ds]?|tripling|produto|multiplica(?:do|r|cao)?|dobr(?:a|ar|ado|ando)|triplic(?:a|ar|ado|ando)|(?:[0-9]+|one|two|three|four|five|six|um|uma|dois|duas|tres|quatro|cinco|seis)\s+(?:times?|vezes?))\b/u,
  ],
  [
    "conditional",
    /\b(?:but|except|otherwise)\s+if\b|\bif\b[^.;:]{0,80}\b(?:then|otherwise|keep|remain)\b|[,;:]\s*else\b|\b(?:penalty|bonus)\b/u,
  ],
  ["digit", /\b(?:digit|digits|digito|digitos)\b/u],
  [
    "set_equality",
    /\b(?:same|identical|equal)\s+sets?\b|\bsets?\b[^.;:]{0,50}\b(?:same|identical|equal)\b/u,
  ],
  // A rule that names WHERE a number sits is not the same rule as one that only
  // asks whether the number appears. "same position" is the cue that separates
  // an ordered comparison from an unordered intersection, and dropping it turns
  // a hard rule into an easy one.
  //
  // Bare "first/last" are deliberately absent: they are ordinary prose ("the
  // first thing to check", "no numbers in the last draw") far more often than a
  // positional index, and the ordinal forms below carry the index explicitly.
  [
    "position",
    /\b(?:position|positions|positional|positionally|posicao|posicoes|slot|slots|index|indexes|indices|(?:first|second|third|fourth|fifth|sixth|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|ultim[oa])\s+(?:guessed?|picked|drawn?|pick|number|numero|dezena)|casa|casas)\b/u,
  ],
];

/**
 * Anything that could still constrain who wins once a vacuous range has been
 * removed from a clause.
 *
 * Deliberately NOT the same vocabulary as the residue gate in index.ts: that one
 * counts positional words as intent-bearing, which is right when asking "was
 * this span read?" but wrong here. The question here is narrower — "does this
 * clause assert anything at all?" — and a positional SUBJECT ("the first drawn
 * number ...") asserts nothing on its own; only the predicate applied to it can.
 */
const CONSTRAINING_RESIDUE =
  /\d|\b(?:greater|higher|above|over|more|most|larger|less|lower|below|under|fewer|least|smaller|equals?|same|different|differs?|exact|exactly|within|match(?:es|ing)?|appears?|contains?|includes?|hits?|sum|sums|total|totals|count|odd|even|parity|digits?|modulo|mod|remainder|multiples?|maior|menor|igua(?:l|is)|diferentes?|exat[oa]|exatamente|acerta\w*|acertos?|aparece\w*|contem|soma|somam?|impar(?:es)?|pares?|digito|digitos|resto|multiplos?)\b/u;

/**
 * Drops clauses that assert nothing because their only content was a range
 * spanning the whole number domain.
 *
 * "win if all your numbers are drawn AND the first drawn number is between 1 and
 * 100" names a POSITION, but the clause naming it is vacuously true of every
 * draw, so a faithful compile omits it entirely. The value side of this module
 * already discounts such ranges (`stripVacuousRanges`); without the same
 * discount here the operation side would demand a positional node for a clause
 * that constrains nothing, and reject the correct artifact.
 *
 * Only clauses that actually contained a full-domain range are candidates — a
 * clause with no vacuous range is never dropped, whatever else it says.
 */
function stripVacuousClauses(value: string) {
  return replaceVacuousRanges(value, VACUOUS_RANGE_MARK)
    .split(/(?:\s+\b(?:and|e)\b\s+|[.;,:])/u)
    .filter(
      (clause) =>
        !clause.includes(VACUOUS_RANGE_MARK) ||
        CONSTRAINING_RESIDUE.test(unmark(clause)),
    )
    .map(unmark)
    .join(" . ");
}

function unmark(value: string) {
  return value.split(VACUOUS_RANGE_MARK).join(" ");
}

export function collectRequiredOperations(text: string): RuleOperation[] {
  const source = stripExampleClauses(normalize(text));
  // A sum of two already-derived scalar measures is addition, not a reduction
  // over ticket numbers. Keep the operation requirement, but credit `arith add`
  // rather than demanding a `reduce sum` node from an equivalent AST.
  const scalarSum =
    /\b(?:sum|total)\s+of\s+(?:the\s+)?(?:span|range|count|score|distance|difference|margin|result|match\s+count)\s+(?:and|plus)\s+(?:the\s+)?(?:span|range|count|score|distance|difference|margin|result|match\s+count)\b/gu;
  const scalarAdd =
    /\badd\b[^.;:]{0,75}\b(?:span|range|count|score|distance|difference|margin|result|matches|hits)\b|\b(?:span|range|count|score|distance|difference|margin|result|matches|hits)\b[^.;:]{0,50}\b(?:plus|added\s+to)\b[^.;:]{0,50}\b(?:span|range|count|score|distance|difference|margin|result|matches|hits)\b|\badd\s+(?:the\s+)?number\s+of\b|\badd\s+(?:the\s+)?(?:two|2)\s+(?:(?:measured|computed|derived)\s+)?(?:values|results|quantities|measures|numbers)\b/u;
  const requiresScalarAdd = scalarSum.test(source) || scalarAdd.test(source);
  let operationText = stripVacuousClauses(
    source.replace(scalarSum, "combined result"),
  ).replace(/\b(?:final|resulting)\s+total\b(?!\s+(?:of|for)\b)/gu, "result");
  // After explicit scalar addition, "the sum" names its result. A separate
  // "sum of the guessed numbers" still requires an array reduction.
  if (requiresScalarAdd) {
    operationText = operationText.replace(
      /\b(?:the|this|that|their)\s+sum\b(?!\s+of\b)/gu,
      "combined result",
    );
  }
  const required = OPERATION_TEXT_CUES.filter(([operation, pattern]) =>
    // Ranking relates the comparison field to its criterion across commas.
    // Clause cleanup may insert periods there; inspect the complete source.
    pattern.test(operation === "ranking" ? source : operationText),
  ).map(([operation]) => operation);
  if (requiresScalarAdd) required.push("scalar_add");
  return required;
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

function predicateClauses(node: unknown, kind: string): unknown[] | null {
  if (!node || typeof node !== "object" || Array.isArray(node)) return null;
  const record = node as Record<string, unknown>;
  return record.kind === kind && Array.isArray(record.clauses)
    ? record.clauses
    : null;
}

function positiveAndNegative(node: unknown): [string, string] | null {
  const clauses = predicateClauses(node, "and");
  if (clauses?.length !== 2) return null;
  const negative = clauses.find(
    (clause) =>
      clause !== null &&
      typeof clause === "object" &&
      !Array.isArray(clause) &&
      (clause as Record<string, unknown>).kind === "not",
  ) as Record<string, unknown> | undefined;
  const positive = clauses.find((clause) => clause !== negative);
  return negative && positive
    ? [JSON.stringify(positive), JSON.stringify(negative.clause)]
    : null;
}

/** Recognize both canonical boolean encodings of exactly one of A and B. */
function isExclusiveDisjunction(node: unknown): boolean {
  const alternatives = predicateClauses(node, "or");
  if (alternatives?.length === 2) {
    const left = positiveAndNegative(alternatives[0]);
    const right = positiveAndNegative(alternatives[1]);
    return (
      left !== null &&
      right !== null &&
      left[0] === right[1] &&
      left[1] === right[0] &&
      left[0] !== left[1]
    );
  }
  const conjunction = predicateClauses(node, "and");
  if (conjunction?.length !== 2) return false;
  const positive = conjunction.find(
    (clause) => predicateClauses(clause, "or")?.length === 2,
  );
  const negative = conjunction.find((clause) => {
    if (!clause || typeof clause !== "object" || Array.isArray(clause))
      return false;
    const record = clause as Record<string, unknown>;
    return (
      record.kind === "not" &&
      predicateClauses(record.clause, "and")?.length === 2
    );
  }) as Record<string, unknown> | undefined;
  const either = predicateClauses(positive, "or");
  const both = predicateClauses(negative?.clause, "and");
  return (
    either !== null &&
    both !== null &&
    either
      .map((clause) => JSON.stringify(clause))
      .sort()
      .join("|") ===
      both
        .map((clause) => JSON.stringify(clause))
        .sort()
        .join("|")
  );
}

function requiresExclusiveDisjunction(node: unknown): boolean {
  if (isExclusiveDisjunction(node)) return true;
  return (predicateClauses(node, "and") ?? []).some(
    requiresExclusiveDisjunction,
  );
}

/**
 * Operations the AST actually performs. Over-inclusive on purpose (this is the
 * covering side), so a broader reading can only reduce false rejections.
 */
export function collectAstOperations(ast: RuleAst): Set<RuleOperation> {
  const operations = new Set<RuleOperation>();
  if (ast.schemaVersion === 1) {
    if (ast.node.kind === "match_count_at_least") {
      operations.add("membership");
    }
    if (ast.node.kind === "sum_equals") {
      operations.add("sum");
    }
    // `ordered_exact` compares the two lists position by position — the v1
    // grammar spells that in the node name rather than in a node tree, so the
    // generic visitor below would never see it and a rule that says "in the same
    // positions" would look like it had lost its positional condition.
    if (ast.node.kind === "ordered_exact") {
      operations.add("position");
    }
    return operations;
  }

  const arraySource = (node: unknown): "draw" | "guess" | null => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return null;
    }
    const record = node as Record<string, unknown>;
    if (record.kind === "source") {
      return record.source === "draw" || record.source === "guess"
        ? record.source
        : null;
    }
    // These nodes preserve the lineage of the collection they transform. A
    // quantifier over digits(draw), sort(draw), filter(draw), and so on still
    // quantifies a draw-derived collection; requiring a syntactically bare
    // source made coverage depend on the provider's encoding rather than the
    // operation the rule performs.
    if (
      [
        "digits",
        "distinct",
        "filter",
        "filter_compare",
        "filter_mod",
        "map",
        "map_arithmetic",
        "map_with_guard",
        "remove_up_to_n",
        "reverse",
        "slice",
        "sort",
      ].includes(String(record.kind))
    ) {
      return arraySource(record.of);
    }
    // Intersection and difference retain values and ordering from their left
    // operand. The right operand constrains membership but is not the array the
    // surrounding forall/exists iterates.
    if (record.kind === "intersection" || record.kind === "difference") {
      return arraySource(record.left);
    }
    return null;
  };

  const isElemPairEquality = (node: unknown) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return false;
    }
    const record = node as Record<string, unknown>;
    if (record.kind !== "compare" || record.op !== "eq") {
      return false;
    }
    const levels = [record.left, record.right]
      .filter(
        (operand): operand is Record<string, unknown> =>
          operand !== null &&
          typeof operand === "object" &&
          !Array.isArray(operand),
      )
      .filter((operand) => operand.kind === "elem")
      .map((operand) => (typeof operand.up === "number" ? operand.up : 0));
    return levels.length === 2 && new Set(levels).size === 2;
  };

  const readSubsetRelation = (
    node: unknown,
  ): readonly [string, string] | null => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return null;
    }
    const outer = node as Record<string, unknown>;
    if (
      outer.kind !== "forall" ||
      !outer.of ||
      typeof outer.of !== "object" ||
      Array.isArray(outer.of) ||
      !outer.where ||
      typeof outer.where !== "object" ||
      Array.isArray(outer.where)
    ) {
      return null;
    }
    const where = outer.where as Record<string, unknown>;
    if (
      where.kind === "exists" &&
      where.of &&
      typeof where.of === "object" &&
      !Array.isArray(where.of) &&
      isElemPairEquality(where.where)
    ) {
      return [JSON.stringify(outer.of), JSON.stringify(where.of)];
    }
    if (
      where.kind === "contains" &&
      where.array &&
      typeof where.array === "object" &&
      !Array.isArray(where.array) &&
      where.value &&
      typeof where.value === "object" &&
      !Array.isArray(where.value) &&
      (where.value as Record<string, unknown>).kind === "elem"
    ) {
      return [JSON.stringify(outer.of), JSON.stringify(where.array)];
    }
    return null;
  };

  const hasMutualSetInclusion = (node: unknown) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return false;
    }
    const record = node as Record<string, unknown>;
    if (record.kind !== "and" || !Array.isArray(record.clauses)) {
      return false;
    }
    const relations = record.clauses
      .map(readSubsetRelation)
      .filter(
        (relation): relation is readonly [string, string] => relation !== null,
      );
    return relations.some(([left, right]) =>
      relations.some(
        ([reverseLeft, reverseRight]) =>
          left === reverseRight && right === reverseLeft,
      ),
    );
  };

  const isDirectSourceSetEquality = (node: unknown) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      return false;
    }
    const record = node as Record<string, unknown>;
    if (record.kind !== "compare" || record.op !== "eq") {
      return false;
    }
    const sides = [record.left, record.right];
    const countIntersection = sides.find((side) => {
      if (!side || typeof side !== "object" || Array.isArray(side))
        return false;
      const scalar = side as Record<string, unknown>;
      if (
        scalar.kind !== "reduce" ||
        scalar.op !== "count" ||
        !scalar.of ||
        typeof scalar.of !== "object" ||
        Array.isArray(scalar.of)
      ) {
        return false;
      }
      const intersection = scalar.of as Record<string, unknown>;
      return (
        intersection.kind === "intersection" &&
        new Set([
          arraySource(intersection.left),
          arraySource(intersection.right),
        ]).size === 2 &&
        [arraySource(intersection.left), arraySource(intersection.right)].every(
          (source) => source !== null,
        ) &&
        [intersection.left, intersection.right].every(
          (source) =>
            source !== null &&
            typeof source === "object" &&
            !Array.isArray(source) &&
            (source as Record<string, unknown>).kind === "source",
        )
      );
    });
    const literal = sides.find((side) => readLiteral(side) !== null);
    return countIntersection !== undefined && readLiteral(literal) === 6;
  };

  const isCrossSourceElementDistance = (node: unknown) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    const record = node as Record<string, unknown>;
    if (
      record.kind !== "abs" ||
      !record.of ||
      typeof record.of !== "object" ||
      Array.isArray(record.of)
    ) {
      return false;
    }
    const arithmetic = record.of as Record<string, unknown>;
    return (
      arithmetic.op === "sub" &&
      isElemPairEquality({
        kind: "compare",
        left: arithmetic.left,
        op: "eq",
        right: arithmetic.right,
      })
    );
  };

  const isNearestEachReduction = (node: unknown) => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return false;
    const record = node as Record<string, unknown>;
    if (
      record.kind !== "map" ||
      !record.expr ||
      typeof record.expr !== "object" ||
      Array.isArray(record.expr)
    ) {
      return false;
    }
    const reduction = record.expr as Record<string, unknown>;
    if (
      reduction.kind !== "reduce" ||
      reduction.op !== "min" ||
      !reduction.of ||
      typeof reduction.of !== "object" ||
      Array.isArray(reduction.of)
    ) {
      return false;
    }
    const innerMap = reduction.of as Record<string, unknown>;
    return (
      innerMap.kind === "map" &&
      arraySource(record.of) !== null &&
      arraySource(innerMap.of) !== null &&
      arraySource(record.of) !== arraySource(innerMap.of) &&
      isCrossSourceElementDistance(innerMap.expr)
    );
  };

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

    if (
      record.type === "predicate" &&
      requiresExclusiveDisjunction(record.predicate)
    ) {
      operations.add("exclusive_disjunction");
    }

    if (record.type === "ranking") {
      operations.add("ranking");
      if (record.direction === "max") operations.add("maximum");
      if (record.direction === "min") operations.add("minimum");
    }

    if (kind.includes("digit") || kind === "digits") {
      operations.add("digit");
      // Projecting a number to its units digit is exactly value modulo 10.
      // The interpreter may spell that identity out as a parenthetical gloss;
      // requiring a second arithmetic `mod` node would reject an equivalent
      // canonical digit projection.
      if (kind === "digits" && record.place === "units") {
        operations.add("mod");
      }
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
    if (op === "mul" || op === "product" || kind.includes("product")) {
      operations.add("product");
    }
    if (kind === "ite") {
      operations.add("conditional");
    }
    if (kind === "abs") {
      operations.add("distance");
    }
    if (isNearestEachReduction(record)) {
      operations.add("nearest_each");
    }
    if (hasMutualSetInclusion(record) || isDirectSourceSetEquality(record)) {
      operations.add("set_equality");
    }
    if (
      kind === "all_ordered_abs_diff_lte" ||
      kind === "total_ordered_abs_diff_lte" ||
      kind === "value_within_any_count_at_least"
    ) {
      operations.add("distance");
    }
    if (
      kind === "all_ordered_abs_diff_lte" ||
      kind === "all_equal_ordered" ||
      kind === "all_values_between_min_max" ||
      kind === "map_arithmetic" ||
      kind === "map_with_guard"
    ) {
      operations.add("all_guess");
    }
    // `map(guess, expr)` evaluates `expr` once for every guessed number. It is
    // the canonical scoring fold for wording such as "each number is worth N
    // points", so it satisfies the whole-guess quantification even though the
    // resulting score is not a boolean `forall` predicate.
    if (kind === "map" && arraySource(record.of) === "guess") {
      operations.add("all_guess");
    }
    if (
      kind === "intersection" ||
      kind === "difference" ||
      kind === "contains"
    ) {
      operations.add("membership");
    }
    if (kind === "distinct") {
      operations.add("distinct");
    }
    if (kind === "sort") {
      operations.add("sort");
      // A fully sorted fixed-size ticket supports every order statistic in both
      // directions. `at(1, sort(desc))` is the second largest; the equivalent
      // `at(4, sort(asc))` selects the same value. Treating the sort direction as
      // only one extreme made coverage depend on the model's encoding rather
      // than executable semantics and rejected equivalent ASTs.
      operations.add("minimum");
      operations.add("maximum");
    }
    if (
      kind === "slice" &&
      record.end === -1 &&
      record.of !== null &&
      typeof record.of === "object" &&
      (record.of as Record<string, unknown>).kind === "sort" &&
      (record.of as Record<string, unknown>).order === "asc"
    ) {
      operations.add("maximum");
    }
    if (kind === "forall" || kind === "exists") {
      const source = arraySource(record.of);
      if (source) {
        const operation = `${kind === "forall" ? "all" : "exists"}_${String(
          source,
        )}` as RuleOperation;
        operations.add(operation);
      }
    }
    if (kind === "pairs_forall" && arraySource(record.left) === "guess") {
      operations.add("all_guess");
    }
    if (kind === "all_values_between_min_max") {
      operations.add("minimum");
      operations.add("maximum");
    }
    if (kind === "remove_up_to_n") {
      if (record.strategy === "highest") operations.add("maximum");
      if (record.strategy === "lowest") operations.add("minimum");
    }
    if (kind === "reduce" && op === "min") {
      operations.add("minimum");
    }
    if (kind === "reduce" && op === "max") {
      operations.add("maximum");
    }
    if (kind === "reduce" && op === "range_span") {
      operations.add("minimum");
      operations.add("maximum");
      operations.add("distance");
    }
    if (
      (kind === "pairs_map" ||
        kind === "pairs_forall" ||
        kind === "pairs_exists") &&
      [record.left, record.right].every(
        (side) =>
          side !== null &&
          typeof side === "object" &&
          (side as Record<string, unknown>).kind === "slice",
      )
    ) {
      operations.add("adjacent_gap");
    }
    // `total_ordered_abs_diff_lte` adds up per-position differences: a total is
    // a sum, whatever the node is called.
    if (op === "sum" || kind.includes("sum") || kind.includes("total")) {
      operations.add("sum");
    }
    if (kind === "arith" && op === "add") {
      operations.add("scalar_add");
    }
    if (kind === "pairs_exists") {
      operations.add("comparison_exists");
    }
    // An existential over mapped truth flags is the same quantifier as
    // pairs_exists. Only credit a test selecting the true branch; selecting
    // zero, using forall, or reading an outer binder means something else.
    if (kind === "exists") {
      const mapped = record.of as Record<string, unknown> | undefined;
      const flag = mapped?.expr as Record<string, unknown> | undefined;
      const condition = flag?.if as Record<string, unknown> | undefined;
      const where = record.where as Record<string, unknown> | undefined;
      const element = where?.left as Record<string, unknown> | undefined;
      if (
        (mapped?.kind === "pairs_map" || mapped?.kind === "map") &&
        flag?.kind === "ite" &&
        condition?.kind === "compare" &&
        readLiteral(flag.then) === 1 &&
        readLiteral(flag.else) === 0 &&
        where?.kind === "compare" &&
        element?.kind === "elem" &&
        (element.up ?? 0) === 0 &&
        (((where.op === "eq" || where.op === "gte") &&
          readLiteral(where.right) === 1) ||
          (where.op === "gt" && readLiteral(where.right) === 0))
      ) {
        operations.add("comparison_exists");
      }
    }
    // An explicit OR of bounded comparisons is another encoding of "at
    // least one comparison holds". A conjunction, or an OR containing an
    // unrelated predicate, is not that existential comparison.
    if (
      kind === "or" &&
      Array.isArray(record.clauses) &&
      record.clauses.length >= 2 &&
      record.clauses.every(
        (clause) =>
          clause !== null &&
          typeof clause === "object" &&
          !Array.isArray(clause) &&
          (clause as Record<string, unknown>).kind === "compare",
      )
    ) {
      operations.add("comparison_exists");
    }
    // The v3 idiom for "N of these comparisons hold" is either a count of a
    // predicate-filtered list or a sum of 1/0 values produced by `ite`. Merely
    // containing comparisons is insufficient: an `and` of the clauses has
    // different semantics and must not satisfy this operation.
    if (
      kind === "reduce" &&
      ((op === "count" &&
        record.of !== null &&
        typeof record.of === "object" &&
        (record.of as Record<string, unknown>).kind === "filter") ||
        (op === "sum" &&
          record.of !== null &&
          typeof record.of === "object" &&
          ((record.of as Record<string, unknown>).kind === "map" ||
            (record.of as Record<string, unknown>).kind === "pairs_map") &&
          (record.of as Record<string, unknown>).expr !== null &&
          typeof (record.of as Record<string, unknown>).expr === "object" &&
          (
            (record.of as Record<string, unknown>).expr as Record<
              string,
              unknown
            >
          ).kind === "ite"))
    ) {
      operations.add("comparison_count");
      operations.add("comparison_exists");
    }
    // Anything that reads a specific index, walks two arrays in lockstep, or
    // carries "ordered"/"position" in its name is positional. `slice`/`reverse`
    // are included because both select by index. Plain `sort` is NOT: it imposes
    // an order to aggregate over (min/max/span), which is how a rule that never
    // mentions positions is normally built — counting it would make the cue
    // satisfiable by almost any AST and the gate meaningless.
    if (
      kind === "at" ||
      kind === "slice" ||
      kind === "reverse" ||
      kind.startsWith("pairs_") ||
      kind.includes("ordered") ||
      kind.includes("position") ||
      kind.includes("reversed")
    ) {
      operations.add("position");
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
