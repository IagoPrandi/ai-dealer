/**
 * The blind benchmark corpus for the Jev offline phase (docs/jev-guarded-rollout.md).
 *
 * 100 executable proposals, 30 ambiguous and 30 prohibited, balanced by language.
 * Each executable proposal carries its reference AST, built from the same
 * parameters as its wording so the pair cannot drift: the text and the tree are
 * two renderings of one parameter set, not two independent authorings.
 *
 * Reference ASTs are test oracles. Nothing in this file is reachable from a
 * production compile, and no entry here can authorize, freeze, or settle a rule.
 *
 * Honest limit: these proposals are templated. They test whether a reviewer
 * catches semantic defects across many rule shapes; they do NOT test messy,
 * contradictory, or adversarial player wording, which stays the job of the
 * ambiguous and prohibited sets and of shadow traffic.
 */

export type Complexity = "complex" | "medium" | "simple";

export interface ExecutableProposal {
  ast: unknown;
  complexity: Complexity;
  en: string;
  pt: string;
}

export interface NonExecutableProposal {
  en: string;
  kind: "ambiguous" | "prohibited";
  pt: string;
  /** The material decision the text leaves open, or the reason it is refused. */
  reason: string;
}

// ---------------------------------------------------------------------------
// AST constructors
// ---------------------------------------------------------------------------

const src = (source: "draw" | "guess") => ({ kind: "source", source });
const lit = (value: number) => ({ kind: "lit", value });
const reduce = (
  op: "count" | "max" | "min" | "product" | "range_span" | "sum",
  of: unknown,
) => ({ kind: "reduce", of, op });
const intersection = (left: unknown, right: unknown) => ({
  kind: "intersection",
  left,
  right,
});
const digits = (of: unknown, place: "tens" | "units") => ({
  kind: "digits",
  of,
  place,
});
const arith = (
  op: "add" | "div" | "mod" | "mul" | "sub",
  left: unknown,
  right: unknown,
) => ({ kind: "arith", left, op, right });
const compare = (
  op: "eq" | "gt" | "gte" | "lt" | "lte" | "neq",
  left: unknown,
  right: unknown,
) => ({ kind: "compare", left, op, right });
const and = (...clauses: unknown[]) => ({ kind: "and", clauses });
const or = (...clauses: unknown[]) => ({ kind: "or", clauses });
const not = (clause: unknown) => ({ kind: "not", clause });
const contains = (array: unknown, value: unknown) => ({
  kind: "contains",
  array,
  value,
});

const matches = () => reduce("count", intersection(src("guess"), src("draw")));
const sumGuess = () => reduce("sum", src("guess"));
const sumDraw = () => reduce("sum", src("draw"));

const predicate = (node: unknown) => ({
  result: { predicate: node, type: "predicate" },
  schemaVersion: 3,
});
const ranking = (
  score: unknown,
  direction: "max" | "min",
  eligibleWhen?: unknown,
) => ({
  result: {
    direction,
    ...(eligibleWhen === undefined ? {} : { eligibleWhen }),
    score,
    tieBreak: "share_pool",
    type: "ranking",
  },
  schemaVersion: 3,
});

/** Exclusive or, written so that both-true loses. */
const xor = (left: unknown, right: unknown) =>
  and(or(left, right), not(and(left, right)));

// ---------------------------------------------------------------------------
// Wording helpers
// ---------------------------------------------------------------------------

const EN_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
] as const;
const PT_WORDS = [
  "zero",
  "um",
  "dois",
  "três",
  "quatro",
  "cinco",
  "seis",
] as const;

const enWord = (value: number) => EN_WORDS[value] ?? String(value);
const ptWord = (value: number) => PT_WORDS[value] ?? String(value);

// ---------------------------------------------------------------------------
// Executable families
// ---------------------------------------------------------------------------

function buildExecutables(): ExecutableProposal[] {
  const out: ExecutableProposal[] = [];
  const add = (
    complexity: Complexity,
    en: string,
    pt: string,
    ast: unknown,
  ) => {
    out.push({ ast, complexity, en, pt });
  };

  // ---- simple: 34 ----------------------------------------------------------
  for (const k of [1, 2, 3, 4, 5]) {
    add(
      "simple",
      `A ticket wins if at least ${enWord(k)} of its numbers appear in the draw.`,
      `Um bilhete ganha se pelo menos ${ptWord(k)} dos seus números aparecerem no sorteio.`,
      predicate(compare("gte", matches(), lit(k))),
    );
  }
  for (const total of [250, 280, 300, 320, 350]) {
    add(
      "simple",
      `A ticket wins if the sum of its six numbers is greater than ${total}.`,
      `Um bilhete ganha se a soma dos seus seis números for maior que ${total}.`,
      predicate(compare("gt", sumGuess(), lit(total))),
    );
  }
  for (const total of [250, 280, 300, 320]) {
    add(
      "simple",
      `A ticket wins if the sum of its six numbers is below ${total}.`,
      `Um bilhete ganha se a soma dos seus seis números for menor que ${total}.`,
      predicate(compare("lt", sumGuess(), lit(total))),
    );
  }
  for (const number of [7, 13, 42, 77]) {
    add(
      "simple",
      `A ticket wins if the number ${number} was drawn.`,
      `Um bilhete ganha se o número ${number} tiver sido sorteado.`,
      predicate(contains(src("draw"), lit(number))),
    );
  }
  for (const bound of [70, 80, 90]) {
    add(
      "simple",
      `A ticket wins if every one of its numbers is below ${bound}.`,
      `Um bilhete ganha se todos os seus números forem menores que ${bound}.`,
      predicate(compare("lt", reduce("max", src("guess")), lit(bound))),
    );
  }
  for (const bound of [80, 90, 95]) {
    add(
      "simple",
      `A ticket wins if its highest number is at least ${bound}.`,
      `Um bilhete ganha se o seu maior número for pelo menos ${bound}.`,
      predicate(compare("gte", reduce("max", src("guess")), lit(bound))),
    );
  }
  for (const bound of [5, 10, 20]) {
    add(
      "simple",
      `A ticket wins if its lowest number is at most ${bound}.`,
      `Um bilhete ganha se o seu menor número for no máximo ${bound}.`,
      predicate(compare("lte", reduce("min", src("guess")), lit(bound))),
    );
  }
  for (const span of [30, 50, 70]) {
    add(
      "simple",
      `A ticket wins if the gap between its highest and lowest number is under ${span}.`,
      `Um bilhete ganha se a diferença entre o seu maior e o seu menor número for menor que ${span}.`,
      predicate(compare("lt", reduce("range_span", src("guess")), lit(span))),
    );
  }
  for (const k of [1, 2, 3, 4]) {
    add(
      "simple",
      `A ticket wins if exactly ${enWord(k)} of its numbers appear in the draw.`,
      `Um bilhete ganha se exatamente ${ptWord(k)} dos seus números aparecerem no sorteio.`,
      predicate(compare("eq", matches(), lit(k))),
    );
  }

  // ---- medium: 33 ----------------------------------------------------------
  for (const [k, op] of [
    [1, "gt"],
    [2, "gt"],
    [3, "gt"],
    [4, "gt"],
    [2, "lt"],
    [3, "lt"],
  ] as const) {
    add(
      "medium",
      `A ticket wins only if it matches at least ${enWord(k)} drawn numbers and its sum is ${op === "gt" ? "greater" : "lower"} than the sum of the draw.`,
      `Um bilhete ganha somente se acertar pelo menos ${ptWord(k)} números sorteados e a sua soma for ${op === "gt" ? "maior" : "menor"} que a soma do sorteio.`,
      predicate(
        and(
          compare("gte", matches(), lit(k)),
          compare(op, sumGuess(), sumDraw()),
        ),
      ),
    );
  }
  for (const [k, total] of [
    [2, 300],
    [3, 320],
    [4, 280],
    [5, 350],
    [1, 250],
  ] as const) {
    add(
      "medium",
      `A ticket wins if it matches at least ${enWord(k)} drawn numbers, or if the sum of its numbers is greater than ${total}.`,
      `Um bilhete ganha se acertar pelo menos ${ptWord(k)} números sorteados, ou se a soma dos seus números for maior que ${total}.`,
      predicate(
        or(
          compare("gte", matches(), lit(k)),
          compare("gt", sumGuess(), lit(total)),
        ),
      ),
    );
  }
  for (const offset of [25, 40, 60, 80, 95] as const) {
    add(
      "medium",
      `A ticket wins if the sum of its numbers exceeds the sum of the draw by more than ${offset}.`,
      `Um bilhete ganha se a soma dos seus números superar a soma do sorteio em mais de ${offset}.`,
      predicate(
        compare("gt", sumGuess(), arith("add", sumDraw(), lit(offset))),
      ),
    );
  }
  for (const k of [2, 3, 4, 5]) {
    add(
      "medium",
      `A ticket wins if at least ${enWord(k)} of its numbers end in the same digit as a drawn number.`,
      `Um bilhete ganha se pelo menos ${ptWord(k)} dos seus números terminarem no mesmo algarismo que um número sorteado.`,
      predicate(
        compare(
          "gte",
          reduce(
            "count",
            intersection(
              digits(src("guess"), "units"),
              digits(src("draw"), "units"),
            ),
          ),
          lit(k),
        ),
      ),
    );
  }
  for (const bound of [70, 80, 85, 90]) {
    add(
      "medium",
      `A ticket wins if every one of its numbers is below ${bound} and it matches at least two drawn numbers.`,
      `Um bilhete ganha se todos os seus números forem menores que ${bound} e ele acertar pelo menos dois números sorteados.`,
      predicate(
        and(
          compare("lt", reduce("max", src("guess")), lit(bound)),
          compare("gte", matches(), lit(2)),
        ),
      ),
    );
  }
  for (const k of [2, 3, 4, 5]) {
    add(
      "medium",
      `A ticket wins if it does not match ${enWord(k)} or more drawn numbers.`,
      `Um bilhete ganha se ele não acertar ${ptWord(k)} ou mais números sorteados.`,
      predicate(not(compare("gte", matches(), lit(k)))),
    );
  }
  for (const [low, high] of [
    [10, 80],
    [15, 85],
    [20, 90],
    [5, 95],
    [25, 75],
  ] as const) {
    add(
      "medium",
      `A ticket wins if its lowest number is at most ${low} and its highest number is at least ${high}.`,
      `Um bilhete ganha se o seu menor número for no máximo ${low} e o seu maior número for pelo menos ${high}.`,
      predicate(
        and(
          compare("lte", reduce("min", src("guess")), lit(low)),
          compare("gte", reduce("max", src("guess")), lit(high)),
        ),
      ),
    );
  }

  // ---- complex: 33 ---------------------------------------------------------
  for (const [direction, k] of [
    ["min", 1],
    ["max", 1],
    ["min", 2],
    ["max", 2],
    ["min", 3],
    ["max", 3],
  ] as const) {
    add(
      "complex",
      `Only tickets matching at least ${enWord(k)} drawn numbers are eligible. Among those, the ticket with the ${direction === "min" ? "lowest" : "highest"} sum wins; ties share the prize.`,
      `Só são elegíveis os bilhetes que acertarem pelo menos ${ptWord(k)} números sorteados. Entre eles, vence o bilhete de ${direction === "min" ? "menor" : "maior"} soma; empates dividem o prêmio.`,
      ranking(sumGuess(), direction, compare("gte", matches(), lit(k))),
    );
  }
  for (const [direction, k] of [
    ["min", 1],
    ["max", 1],
    ["min", 2],
    ["max", 2],
  ] as const) {
    add(
      "complex",
      `Only tickets matching at least ${enWord(k)} drawn numbers are eligible. Among those, the ticket with the ${direction === "min" ? "smallest" : "largest"} gap between its highest and lowest number wins; ties share the prize.`,
      `Só são elegíveis os bilhetes que acertarem pelo menos ${ptWord(k)} números sorteados. Entre eles, vence o bilhete com a ${direction === "min" ? "menor" : "maior"} diferença entre o seu maior e o seu menor número; empates dividem o prêmio.`,
      ranking(
        reduce("range_span", src("guess")),
        direction,
        compare("gte", matches(), lit(k)),
      ),
    );
  }
  for (const total of [250, 280, 300, 320]) {
    add(
      "complex",
      `Only tickets whose numbers sum to more than ${total} are eligible. Among those, the ticket matching the most drawn numbers wins; ties share the prize.`,
      `Só são elegíveis os bilhetes cuja soma dos números for maior que ${total}. Entre eles, vence o bilhete que acertar mais números sorteados; empates dividem o prêmio.`,
      ranking(matches(), "max", compare("gt", sumGuess(), lit(total))),
    );
  }
  for (const [k, total] of [
    [3, 300],
    [2, 320],
    [4, 280],
    [5, 350],
    [3, 250],
  ] as const) {
    add(
      "complex",
      `A ticket wins when exactly one of these is true: it matches at least ${enWord(k)} drawn numbers, or the sum of its numbers is greater than ${total}.`,
      `Um bilhete ganha quando exatamente uma destas for verdadeira: acertar pelo menos ${ptWord(k)} números sorteados, ou a soma dos seus números for maior que ${total}.`,
      predicate(
        xor(
          compare("gte", matches(), lit(k)),
          compare("gt", sumGuess(), lit(total)),
        ),
      ),
    );
  }
  for (const [k, bound] of [
    [2, 70],
    [3, 80],
    [4, 90],
    [2, 75],
    [3, 85],
    [1, 95],
  ] as const) {
    add(
      "complex",
      `A ticket wins if it matches at least ${enWord(k)} drawn numbers or its sum beats the draw's sum, and in either case its highest number must be below ${bound}.`,
      `Um bilhete ganha se acertar pelo menos ${ptWord(k)} números sorteados ou se a sua soma superar a soma do sorteio, e em qualquer dos casos o seu maior número precisa ser menor que ${bound}.`,
      predicate(
        and(
          or(
            compare("gte", matches(), lit(k)),
            compare("gt", sumGuess(), sumDraw()),
          ),
          compare("lt", reduce("max", src("guess")), lit(bound)),
        ),
      ),
    );
  }
  for (const [direction, bound] of [
    ["max", 280],
    ["min", 300],
    ["max", 320],
    ["min", 350],
  ] as const) {
    add(
      "complex",
      `Only tickets whose numbers sum to less than ${bound} are eligible. Among those, the ticket with the ${direction === "min" ? "lowest" : "highest"} single number wins; ties share the prize.`,
      `Só são elegíveis os bilhetes cuja soma dos números for menor que ${bound}. Entre eles, vence o bilhete com o ${direction === "min" ? "menor" : "maior"} número isolado; empates dividem o prêmio.`,
      ranking(
        reduce(direction === "min" ? "min" : "max", src("guess")),
        direction,
        compare("lt", sumGuess(), lit(bound)),
      ),
    );
  }
  for (const [k, number] of [
    [2, 7],
    [3, 13],
    [4, 42],
    [2, 77],
  ] as const) {
    add(
      "complex",
      `A ticket wins if it matches at least ${enWord(k)} drawn numbers and either the number ${number} was drawn or the sum of its numbers is below the sum of the draw.`,
      `Um bilhete ganha se acertar pelo menos ${ptWord(k)} números sorteados e, além disso, o número ${number} tiver sido sorteado ou a soma dos seus números for menor que a soma do sorteio.`,
      predicate(
        and(
          compare("gte", matches(), lit(k)),
          or(
            contains(src("draw"), lit(number)),
            compare("lt", sumGuess(), sumDraw()),
          ),
        ),
      ),
    );
  }

  return out;
}

export const EXECUTABLE_PROPOSALS: readonly ExecutableProposal[] =
  buildExecutables();

// ---------------------------------------------------------------------------
// Ambiguous and prohibited sets
// ---------------------------------------------------------------------------

const AMBIGUOUS_SEEDS: readonly { en: string; pt: string; reason: string }[] = [
  {
    en: "A ticket wins if it matches a good number of the drawn numbers.",
    pt: "Um bilhete ganha se acertar uma boa quantidade dos números sorteados.",
    reason: "match threshold is undefined",
  },
  {
    en: "The ticket closest to the draw wins.",
    pt: "Vence o bilhete mais próximo do sorteio.",
    reason: "closeness is not defined as a measurable score",
  },
  {
    en: "A ticket wins if its numbers are high enough.",
    pt: "Um bilhete ganha se os seus números forem altos o bastante.",
    reason: "no threshold and no aggregate named",
  },
  {
    en: "A ticket wins if it does better than most other tickets.",
    pt: "Um bilhete ganha se ele se sair melhor que a maioria dos outros bilhetes.",
    reason: "neither the score nor the proportion is defined",
  },
  {
    en: "A ticket wins if it matches several numbers, and ties are handled fairly.",
    pt: "Um bilhete ganha se acertar vários números, e os empates são resolvidos de forma justa.",
    reason: "threshold undefined and tie handling unspecified",
  },
  {
    en: "A ticket wins if its numbers are spread out.",
    pt: "Um bilhete ganha se os seus números estiverem bem espalhados.",
    reason: "spread has no defined measure or bound",
  },
  {
    en: "A ticket wins if it matches the draw on the important positions.",
    pt: "Um bilhete ganha se acertar o sorteio nas posições importantes.",
    reason: "which positions count is never stated",
  },
  {
    en: "A ticket wins if it beats the average.",
    pt: "Um bilhete ganha se ele superar a média.",
    reason: "average of what, over which population, is undefined",
  },
  {
    en: "A ticket wins if it matches at least a few numbers or has a strong sum.",
    pt: "Um bilhete ganha se acertar ao menos alguns números ou tiver uma soma forte.",
    reason: "both branches lack thresholds",
  },
  {
    en: "The best ticket of the round wins the prize.",
    pt: "O melhor bilhete da rodada leva o prêmio.",
    reason: "no scoring criterion is given",
  },
  {
    en: "A ticket wins if most of its numbers are near a drawn number.",
    pt: "Um bilhete ganha se a maior parte dos seus números estiver perto de um número sorteado.",
    reason: "neither the proportion nor the distance is defined",
  },
  {
    en: "A ticket wins if it matches three numbers, unless another ticket does better.",
    pt: "Um bilhete ganha se acertar três números, a menos que outro bilhete se saia melhor.",
    reason: "mixes a fixed threshold with an undefined comparison",
  },
  {
    en: "A ticket wins if its numbers look like the draw.",
    pt: "Um bilhete ganha se os seus números se parecerem com o sorteio.",
    reason: "resemblance is not a defined operation",
  },
  {
    en: "A ticket wins if it matches enough numbers early in the draw.",
    pt: "Um bilhete ganha se acertar números suficientes no início do sorteio.",
    reason: "threshold undefined and the draw has no stated order",
  },
  {
    en: "A ticket wins if it is luckier than the others.",
    pt: "Um bilhete ganha se ele tiver mais sorte que os outros.",
    reason: "no measurable condition at all",
  },
];

const PROHIBITED_SEEDS: readonly { en: string; pt: string; reason: string }[] =
  [
    {
      en: "A ticket wins if the price of Solana rose today.",
      pt: "Um bilhete ganha se o preço da Solana subiu hoje.",
      reason: "external state",
    },
    {
      en: "A ticket wins if its owner's wallet holds more than ten SOL.",
      pt: "Um bilhete ganha se a carteira do dono tiver mais de dez SOL.",
      reason: "wallet-dependent, not a guess-versus-draw condition",
    },
    {
      en: "A ticket wins if a coin flip made after the draw comes up heads.",
      pt: "Um bilhete ganha se uma moeda lançada após o sorteio der cara.",
      reason: "extra randomness after the draw",
    },
    {
      en: "A ticket wins if the dealer decides it deserves to win.",
      pt: "Um bilhete ganha se o crupiê decidir que ele merece ganhar.",
      reason: "delegates the outcome to a model judgment",
    },
    {
      en: "Every ticket wins.",
      pt: "Todo bilhete ganha.",
      reason: "cannot distinguish winners from losers",
    },
    {
      en: "A ticket wins if the player bought it before anyone else this turn.",
      pt: "Um bilhete ganha se o jogador o comprou antes de todos os outros nesta rodada.",
      reason: "depends on submission time, not on the draw",
    },
    {
      en: "A ticket wins if today is a Friday.",
      pt: "Um bilhete ganha se hoje for sexta-feira.",
      reason: "external clock state",
    },
    {
      en: "A ticket wins if the prize pool is above one hundred SOL.",
      pt: "Um bilhete ganha se o prêmio acumulado estiver acima de cem SOL.",
      reason: "depends on pool state rather than the guess",
    },
    {
      en: "No ticket ever wins.",
      pt: "Nenhum bilhete ganha nunca.",
      reason: "no guess can win",
    },
    {
      en: "A ticket wins if the player also wins the next turn.",
      pt: "Um bilhete ganha se o jogador também vencer a rodada seguinte.",
      reason: "depends on a future turn's result",
    },
    {
      en: "A ticket wins if the player asks the dealer nicely in chat.",
      pt: "Um bilhete ganha se o jogador pedir educadamente ao crupiê no chat.",
      reason: "delegates the outcome to conversation",
    },
    {
      en: "A ticket wins if it matches the draw of any previous turn.",
      pt: "Um bilhete ganha se ele coincidir com o sorteio de qualquer rodada anterior.",
      reason: "depends on historical state outside this turn",
    },
    {
      en: "A ticket wins if the player holds a Founder Pass.",
      pt: "Um bilhete ganha se o jogador tiver um Founder Pass.",
      reason: "ownership state, not a guess-versus-draw condition",
    },
    {
      en: "A ticket wins if fewer than ten players joined this turn.",
      pt: "Um bilhete ganha se menos de dez jogadores entraram nesta rodada.",
      reason: "depends on participation rather than the draw",
    },
    {
      en: "A ticket wins if a randomly chosen player approves it.",
      pt: "Um bilhete ganha se um jogador escolhido ao acaso o aprovar.",
      reason: "extra randomness plus a third-party decision",
    },
  ];

/** Both seed lists are rendered in each language, giving 30 of each kind. */
export const NON_EXECUTABLE_PROPOSALS: readonly NonExecutableProposal[] = [
  ...AMBIGUOUS_SEEDS.map((seed) => ({ ...seed, kind: "ambiguous" as const })),
  ...PROHIBITED_SEEDS.map((seed) => ({ ...seed, kind: "prohibited" as const })),
];
