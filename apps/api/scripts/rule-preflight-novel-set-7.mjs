// Test set 7 - four rules whose composition appears nowhere in sets 1-6, plus
// two deliberately imprecise rules used to exercise the clarification loop.
// Driven through the same two-phase flow the Create screen uses
// (`interpret` -> approve -> `compile`). Every accepted AST is executed against
// boundary fixtures written from the ORIGINAL prompt before the run; agent
// prose is never the oracle.
//
// Capability axes chosen because no earlier set touched them:
//   N1  nested quantifier in the DRAW->guess direction (forall draw / exists
//       guess) conjoined with an empty-intersection clause
//   N2  a property of the DRAW selects which branch of the rule applies
//   N3  distinctness over a derived array of adjacent gaps (pairs_map over two
//       slices of the same sorted guess, then `distinct` cardinality)
//   N4  ranking scored by a modulo whose divisor is a draw aggregate, with a
//       membership eligibility gate
//
// Imprecise pair (clarification loop):
//   V1  two undefined magnitudes ("spread out enough", "not too close")
//   V2  an undefined ranking criterion ("best mirrors the draw")
// Round 2 replays each with `clarifiedText`, written from the questions the
// agent itself asked in round 1.
import { request as httpRequest } from "node:http";
import {
  evaluatePredicate,
  evaluateRankingEntry,
  resolveRankingWinners,
  ruleAstSchema,
  validateAndPrecompileRule,
} from "@tyche/rule-compiler";

const DRAW = [10, 20, 30, 40, 50, 60];

// --- reference ASTs: expressibility is proved before the agent is judged ----
const src = (source) => ({ kind: "source", source });
const red = (op, of) => ({ kind: "reduce", op, of });
const lit = (value) => ({ kind: "lit", value });
const cmp = (op, left, right) => ({ kind: "compare", op, left, right });
const ar = (op, left, right) => ({ kind: "arith", op, left, right });
const predicate = (node) => ({
  schemaVersion: 3,
  result: { type: "predicate", predicate: node },
});
const parity = (source, value) =>
  cmp("eq", ar("mod", red("sum", src(source)), lit(2)), lit(value));
const ascGuess = { kind: "sort", order: "asc", of: src("guess") };
const adjacentGaps = {
  kind: "pairs_map",
  left: { kind: "slice", of: ascGuess, start: 0, end: -1 },
  right: { kind: "slice", of: ascGuess, start: 1 },
  expr: ar("sub", { kind: "pair", side: "right" }, { kind: "pair", side: "left" }),
};
const noSharedNumber = cmp(
  "eq",
  red("count", { kind: "intersection", left: src("guess"), right: src("draw") }),
  lit(0),
);

const referenceAsts = {
  "N1-draw-side-coverage": predicate({
    kind: "and",
    clauses: [
      {
        kind: "forall",
        of: src("draw"),
        where: {
          kind: "exists",
          of: src("guess"),
          where: cmp(
            "lte",
            {
              kind: "abs",
              of: ar("sub", { kind: "elem", up: 0 }, { kind: "elem", up: 1 }),
            },
            lit(3),
          ),
        },
      },
      noSharedNumber,
    ],
  }),
  "N2-draw-parity-branch": predicate({
    kind: "or",
    clauses: [
      {
        kind: "and",
        clauses: [
          parity("draw", 0),
          parity("guess", 0),
          cmp("gt", red("sum", src("guess")), red("sum", src("draw"))),
        ],
      },
      {
        kind: "and",
        clauses: [
          parity("draw", 1),
          parity("guess", 1),
          cmp("lt", red("sum", src("guess")), red("sum", src("draw"))),
        ],
      },
    ],
  }),
  "N3-distinct-adjacent-gaps": predicate({
    kind: "and",
    clauses: [
      cmp("eq", red("count", { kind: "distinct", of: adjacentGaps }), lit(5)),
      cmp("lt", red("max", adjacentGaps), red("min", src("draw"))),
    ],
  }),
  "N4-modulo-ranking": {
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "max",
      tieBreak: "share_pool",
      eligibleWhen: cmp(
        "gte",
        red("count", {
          kind: "intersection",
          left: src("guess"),
          right: src("draw"),
        }),
        lit(1),
      ),
      score: ar("mod", red("sum", src("guess")), red("min", src("draw"))),
    },
  },
};

const cases = [
  {
    id: "N1-draw-side-coverage",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if every drawn number has at least one guessed number within 3 of it, and none of the guessed numbers is itself one of the drawn numbers.",
    fixtures: [
      { note: "each drawn number covered from 3 below, no overlap", guess: [7, 17, 27, 37, 47, 57], draw: DRAW, outcome: "WIN" },
      { note: "each drawn number covered from 3 above, no overlap", guess: [13, 23, 33, 43, 53, 63], draw: DRAW, outcome: "WIN" },
      { note: "coverage holds but one guessed number is drawn", guess: [7, 17, 27, 37, 47, 60], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: 63 covers 60 at exactly 3", guess: [7, 17, 27, 37, 47, 63], draw: DRAW, outcome: "WIN" },
      { note: "boundary: 64 is 4 away, 60 uncovered", guess: [7, 17, 27, 37, 47, 64], draw: DRAW, outcome: "LOSE" },
      { note: "discriminator: flipped quantifier would win, draw-side coverage loses", guess: [7, 8, 9, 11, 12, 13], draw: DRAW, outcome: "LOSE" },
      { note: "one guessed number may cover several drawn numbers", guess: [9, 16, 50, 51, 52, 53], draw: [10, 11, 12, 13, 14, 15], outcome: "WIN" },
    ],
  },
  {
    id: "N2-draw-parity-branch",
    kind: "predicate",
    expect: ["VALID"],
    text: "If the sum of the six drawn numbers is even, a guess wins when its own sum is also even and strictly greater than the drawn sum. If the sum of the drawn numbers is odd, a guess wins when its own sum is odd and strictly smaller than the drawn sum.",
    fixtures: [
      { note: "even draw sum 210: guess 220 even and greater", guess: [11, 21, 31, 41, 51, 65], draw: DRAW, outcome: "WIN" },
      { note: "even draw sum: guess 221 is greater but odd", guess: [11, 21, 31, 41, 51, 66], draw: DRAW, outcome: "LOSE" },
      { note: "even draw sum: guess 21 is odd and smaller - wrong branch", guess: [1, 2, 3, 4, 5, 6], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: guess sum exactly equals the even draw sum", guess: [5, 15, 25, 45, 55, 65], draw: DRAW, outcome: "LOSE" },
      { note: "odd draw sum 211: guess 21 odd and smaller", guess: [1, 2, 3, 4, 5, 6], draw: [10, 20, 30, 40, 50, 61], outcome: "WIN" },
      { note: "odd draw sum: guess 22 is smaller but even", guess: [1, 2, 3, 4, 5, 7], draw: [10, 20, 30, 40, 50, 61], outcome: "LOSE" },
      { note: "odd draw sum: guess 315 is odd but greater", guess: [50, 51, 52, 53, 54, 55], draw: [10, 20, 30, 40, 50, 61], outcome: "LOSE" },
      { note: "boundary: guess sum exactly equals the odd draw sum", guess: [30, 31, 32, 33, 34, 51], draw: [10, 20, 30, 40, 50, 61], outcome: "LOSE" },
    ],
  },
  {
    id: "N3-distinct-adjacent-gaps",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if, once its six numbers are sorted from smallest to largest, the five gaps between consecutive numbers are all different from one another, and the largest of those gaps is smaller than the lowest drawn number.",
    fixtures: [
      { note: "gaps 1,2,3,4,5 all different, largest 5 below the lowest drawn 10", guess: [1, 2, 4, 7, 11, 16], draw: DRAW, outcome: "WIN" },
      { note: "same multiset given unsorted", guess: [16, 1, 11, 2, 7, 4], draw: DRAW, outcome: "WIN" },
      { note: "all gaps equal to 1", guess: [1, 2, 3, 4, 5, 6], draw: DRAW, outcome: "LOSE" },
      { note: "gaps different but the largest is 19", guess: [1, 2, 4, 7, 11, 30], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: largest gap 9, one below the lowest drawn 10", guess: [1, 3, 6, 10, 15, 24], draw: DRAW, outcome: "WIN" },
      { note: "boundary: largest gap exactly the lowest drawn 10", guess: [1, 3, 6, 10, 15, 25], draw: DRAW, outcome: "LOSE" },
      { note: "two gaps of 2 repeat", guess: [1, 3, 5, 8, 12, 17], draw: DRAW, outcome: "LOSE" },
      { note: "draw sensitivity: same guess wins once the lowest drawn number is 11", guess: [1, 3, 6, 10, 15, 25], draw: [11, 20, 30, 40, 50, 60], outcome: "WIN" },
    ],
  },
  {
    id: "N4-modulo-ranking",
    kind: "ranking",
    expect: ["VALID"],
    text: "The winning ticket is the one whose total leaves the biggest remainder when divided by the lowest drawn number. Only tickets that contain at least one drawn number are eligible, and tickets with the same remainder share the prize.",
    rankingFixtures: [
      {
        note: "biggest remainder wins among eligible tickets",
        draw: DRAW,
        entries: { A: [10, 1, 2, 3, 4, 5], B: [20, 1, 2, 3, 4, 6], C: [1, 2, 3, 4, 5, 7] },
        winners: ["B"],
      },
      {
        note: "eligibility bites: the biggest remainder holds no drawn number",
        draw: DRAW,
        entries: { D: [1, 2, 3, 4, 5, 14], E: [10, 1, 2, 3, 4, 5] },
        winners: ["E"],
      },
      {
        note: "nobody holds a drawn number, so nobody wins",
        draw: DRAW,
        entries: { F: [1, 2, 3, 4, 5, 6], G: [2, 3, 4, 5, 6, 7] },
        winners: [],
      },
      {
        note: "equal remainders share the pool",
        draw: DRAW,
        entries: { H: [10, 1, 2, 3, 4, 5], K: [20, 1, 2, 3, 4, 5] },
        winners: ["H", "K"],
      },
      {
        note: "remainder 0 still ranks, it is simply the worst",
        draw: DRAW,
        entries: { L: [10, 20, 30, 40, 50, 60], M: [10, 1, 2, 3, 4, 5] },
        winners: ["M"],
      },
      {
        note: "draw sensitivity: a lower lowest-drawn number flips the winner",
        draw: [7, 10, 20, 30, 40, 50],
        entries: { A: [20, 1, 2, 3, 4, 6], B: [10, 1, 2, 3, 4, 5] },
        winners: ["B"],
      },
    ],
  },
  {
    id: "V1-vague-spread-and-distance",
    kind: "vague",
    expect: ["CLARIFY"],
    text: "A guess wins if its numbers are spread out enough and not too close to the drawn ones.",
  },
  {
    id: "V2-vague-best-mirror",
    kind: "vague",
    expect: ["CLARIFY"],
    text: "Among all the tickets, the one that best mirrors the draw wins.",
  },
];

// Round 2. Every text here is a consequence of what round 1 itself produced:
// V1b/V2b answer the agent's own clarification questions, N1b is the agent's
// own offered rewrite pasted back verbatim (the one that IS the player's rule),
// and N4b is N4 with only the tie-break reworded, to isolate the pre-LLM
// external-dependency gate from the rule.
const round2Cases = [
  {
    id: "V1b-clarified-spread-and-distance",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if both of these hold: the largest gap between its consecutive sorted numbers is at least 8, and every one of its numbers is at least 4 away from every drawn number.",
    fixtures: [
      { note: "largest gap 10 and every number at least 4 from every drawn", guess: [1, 2, 3, 4, 5, 15], draw: DRAW, outcome: "WIN" },
      { note: "boundary: distance exactly 4 still qualifies", guess: [1, 2, 3, 4, 5, 14], draw: DRAW, outcome: "WIN" },
      { note: "boundary: distance 3 is too close", guess: [1, 2, 3, 4, 5, 13], draw: DRAW, outcome: "LOSE" },
      { note: "largest gap only 1", guess: [1, 2, 3, 4, 5, 6], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: largest gap exactly 8", guess: [1, 2, 3, 4, 5, 13], draw: [20, 30, 40, 50, 60, 70], outcome: "WIN" },
      { note: "boundary: largest gap 7 is one short", guess: [1, 2, 3, 4, 5, 12], draw: [20, 30, 40, 50, 60, 70], outcome: "LOSE" },
      { note: "draw sensitivity: the same guess is too close to a nearer draw", guess: [1, 2, 3, 4, 5, 15], draw: [17, 30, 40, 50, 60, 70], outcome: "LOSE" },
    ],
  },
  {
    id: "V2b-clarified-position-hits-ranking",
    kind: "ranking",
    expect: ["VALID"],
    text: "Among all tickets, the winner is the one with the most numbers sitting in the same position as the drawn number in that position; if several tickets tie on that count, they split it equally.",
    rankingFixtures: [
      {
        note: "two position hits beats one and zero",
        draw: DRAW,
        entries: { A: [10, 20, 3, 4, 5, 6], B: [10, 2, 3, 4, 5, 6], C: [1, 2, 3, 4, 5, 7] },
        winners: ["A"],
      },
      {
        note: "equal position-hit counts share the pool",
        draw: DRAW,
        entries: { A: [10, 20, 3, 4, 5, 6], B: [1, 2, 30, 40, 5, 6] },
        winners: ["A", "B"],
      },
      {
        note: "position matters, not membership: B holds every drawn number in the wrong place",
        draw: DRAW,
        entries: { A: [10, 2, 3, 4, 5, 6], B: [60, 50, 40, 30, 20, 10] },
        winners: ["A"],
      },
      {
        note: "nobody hits a position, so every ticket ties at zero",
        draw: DRAW,
        entries: { A: [1, 2, 3, 4, 5, 6], B: [2, 3, 4, 5, 6, 7] },
        winners: ["A", "B"],
      },
      {
        note: "draw sensitivity: reordering the draw moves the winner",
        draw: [60, 50, 40, 30, 20, 10],
        entries: { A: [10, 20, 3, 4, 5, 6], B: [60, 50, 40, 30, 20, 10] },
        winners: ["B"],
      },
    ],
  },
  {
    id: "N1b-agent-offered-rewrite",
    kind: "predicate",
    expect: ["VALID"],
    // The agent's own suggestedRewrites[1] from round 1, pasted back unchanged.
    text: "A guess wins if every value of the drawn numbers satisfies that at least one value of your numbers satisfies that the distance from zero of (the value 1 level(s) further out minus the value) is at most 3 and every value of your numbers satisfies that it is not the case that the drawn numbers include the value.",
    fixtures: cases.find(({ id }) => id === "N1-draw-side-coverage").fixtures,
  },
  {
    id: "N4b-modulo-ranking-reworded-tiebreak",
    kind: "ranking",
    expect: ["VALID"],
    text: "The winning ticket is the one whose total leaves the biggest remainder when divided by the lowest drawn number. Only tickets that contain at least one drawn number are eligible, and tickets with the same remainder split it equally.",
    rankingFixtures: cases.find(({ id }) => id === "N4-modulo-ranking").rankingFixtures,
  },
];

referenceAsts["V1b-clarified-spread-and-distance"] = predicate({
  kind: "and",
  clauses: [
    cmp("gte", red("max", adjacentGaps), lit(8)),
    {
      kind: "forall",
      of: src("guess"),
      where: {
        kind: "forall",
        of: src("draw"),
        where: cmp(
          "gte",
          {
            kind: "abs",
            of: ar("sub", { kind: "elem", up: 0 }, { kind: "elem", up: 1 }),
          },
          lit(4),
        ),
      },
    },
  ],
});
referenceAsts["V2b-clarified-position-hits-ranking"] = {
  schemaVersion: 3,
  result: {
    type: "ranking",
    direction: "max",
    tieBreak: "share_pool",
    score: red("sum", {
      kind: "pairs_map",
      left: src("guess"),
      right: src("draw"),
      expr: {
        kind: "ite",
        if: cmp("eq", { kind: "pair", side: "left" }, { kind: "pair", side: "right" }),
        then: lit(1),
        else: lit(0),
      },
    }),
  },
};
referenceAsts["N1b-agent-offered-rewrite"] = referenceAsts["N1-draw-side-coverage"];
referenceAsts["N4b-modulo-ranking-reworded-tiebreak"] = referenceAsts["N4-modulo-ranking"];

function classify(preflight, status) {
  if (status !== 200 || !preflight) return "BLOCK";
  if (preflight.reproposalBlocked) return "REPROPOSAL_BLOCKED";
  if (preflight.decision === "VALID" && !preflight.needsClarification) return "VALID";
  return "CLARIFY";
}

function verifyPredicateFixtures(ast, fixtures = []) {
  if (fixtures.length === 0) return { checked: 0, failures: [] };
  if (!ast) return { checked: 0, failures: [{ reason: "accepted case returned no AST" }] };
  const failures = [];
  for (const fixture of fixtures) {
    try {
      const actual = evaluatePredicate(ast, { draw: fixture.draw, guess: fixture.guess }).result;
      if (actual !== fixture.outcome) {
        failures.push({ note: fixture.note, expected: fixture.outcome, actual });
      }
    } catch (error) {
      failures.push({ note: fixture.note, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { checked: fixtures.length, failures };
}

function verifyRankingFixtures(ast, fixtures = []) {
  if (fixtures.length === 0) return { checked: 0, failures: [] };
  if (!ast) return { checked: 0, failures: [{ reason: "accepted case returned no AST" }] };
  const direction = ast.result?.direction ?? "max";
  const failures = [];
  for (const fixture of fixtures) {
    try {
      const scored = Object.entries(fixture.entries).map(([player, guess]) => {
        const evaluation = evaluateRankingEntry(ast, { draw: fixture.draw, guess });
        return { player, eligible: evaluation.eligible, score: evaluation.score };
      });
      const winners = [...resolveRankingWinners(scored, direction)].sort();
      const expected = [...fixture.winners].sort();
      if (JSON.stringify(winners) !== JSON.stringify(expected)) {
        failures.push({ note: fixture.note, expected, actual: winners, scored });
      }
    } catch (error) {
      failures.push({ note: fixture.note, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { checked: fixtures.length, failures };
}

function verifyFixtures(testCase, ast) {
  if (testCase.kind === "vague") return { checked: 0, failures: [] };
  return testCase.kind === "ranking"
    ? verifyRankingFixtures(ast, testCase.rankingFixtures)
    : verifyPredicateFixtures(ast, testCase.fixtures);
}

// Streamed over `node:http` rather than `fetch`. A compile chain regularly runs
// past five minutes, which is exactly undici's default `bodyTimeout`: the global
// fetch aborts the response body mid-stream with UND_ERR_BODY_TIMEOUT, and
// because that rejects inside the read loop it killed the whole run and lost
// every case after it. `node:http` lets the idle timeout be disabled outright,
// and a stream fault is recorded against THIS case so the rest stay measurable.
function callPreflight(baseUrl, body) {
  const startedAt = Date.now();
  const stages = [];
  const payload = JSON.stringify(body);
  const target = new URL(`${baseUrl}/rule-preflight`);

  return new Promise((resolve) => {
    const settle = (result) => resolve({ stages, ms: Date.now() - startedAt, ...result });
    const request = httpRequest(
      {
        headers: {
          accept: "application/x-ndjson",
          "content-length": Buffer.byteLength(payload),
          "content-type": "application/json",
        },
        hostname: target.hostname,
        method: "POST",
        path: target.pathname,
        port: target.port,
        protocol: target.protocol,
      },
      (response) => {
        const status = response.statusCode ?? 0;
        let buffer = "";
        let body = "";
        let terminal = null;
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          if (status >= 400) {
            body += chunk;
            return;
          }
          buffer += chunk;
          let newline;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            let event;
            try {
              event = JSON.parse(line);
            } catch {
              continue;
            }
            if (event.type === "progress") {
              stages.push({
                atMs: Date.now() - startedAt,
                stage: event.progress.stage,
                model: event.progress.model ?? null,
              });
            } else {
              terminal = event;
            }
          }
        });
        response.on("end", () =>
          settle({ status, terminal, transportError: status >= 400 ? body : null }),
        );
        response.on("error", (error) =>
          settle({ status, terminal, transportError: `stream aborted: ${error.message}` }),
        );
      },
    );
    // The pipeline, not the socket, decides how long this takes.
    request.setTimeout(0);
    request.on("error", (error) =>
      settle({ status: 0, terminal: null, transportError: String(error) }),
    );
    request.end(payload);
  });
}

function toApprovedInterpretation(interpretation) {
  return {
    addedOperationalClauses: interpretation.addedOperationalClauses ?? [],
    clarificationQuestions: interpretation.clarificationQuestions ?? [],
    clarityNote: interpretation.clarityNote ?? "",
    dealerMessage: interpretation.dealerMessage ?? "",
    needsClarification: false,
    normalizedText: interpretation.normalizedText,
    officialInterpretation: interpretation.officialInterpretation,
    sanitizedText: interpretation.sanitizedText,
    suggestedRewrites: interpretation.suggestedRewrites ?? [],
    title: interpretation.title,
  };
}

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3099";
const compact = process.argv.includes("--compact");
const refsOnly = process.argv.includes("--refs");
const offline = process.argv.includes("--offline");
const round2 = process.argv.includes("--round2");
const onlyIds = new Set(process.argv.slice(3).filter((argument) => !argument.startsWith("--")));
const corpus = round2 ? round2Cases : cases;
const selected = onlyIds.size > 0 ? corpus.filter(({ id }) => onlyIds.has(id)) : corpus;
const results = [];

function printResult(result, progress) {
  if (!compact) {
    console.log(JSON.stringify({ progress, ...result }));
    return;
  }
  console.log(
    JSON.stringify({
      progress,
      id: result.id,
      actual: result.actual,
      pass: result.pass,
      fixtureChecks: result.fixtureChecks,
      fixtureFailures: result.fixtureFailures.length,
      reasonCodes: result.reasonCodes,
      latencyMs: result.latencyMs,
    }),
  );
}

if (refsOnly) {
  // Proves the DSL can say each rule, so a refusal below cannot be blamed on it.
  for (const testCase of selected) {
    const ast = referenceAsts[testCase.id];
    if (!ast) {
      console.log(JSON.stringify({ id: testCase.id, referenceAst: null }));
      continue;
    }
    const parsed = ruleAstSchema.safeParse(ast);
    const fixtureResult = verifyFixtures(testCase, parsed.success ? ast : null);
    console.log(
      JSON.stringify({
        id: testCase.id,
        schemaValid: parsed.success,
        schemaIssues: parsed.success ? [] : parsed.error.issues.slice(0, 3),
        fixtureChecks: fixtureResult.checked,
        fixtureFailures: fixtureResult.failures,
      }),
    );
  }
} else if (offline) {
  for (const [index, testCase] of selected.entries()) {
    const text = testCase.text;
    const validation = validateAndPrecompileRule({
      originalText: text,
      prompt: text,
      tokenCount: text.trim().split(/\s+/u).length,
    });
    const ast = validation.artifact?.ast ?? null;
    const fixtureResult = verifyFixtures(testCase, ast);
    const actual = validation.decision === "VALID" ? "VALID" : "CLARIFY";
    const result = {
      id: testCase.id,
      actual,
      expected: testCase.expect,
      fixtureChecks: fixtureResult.checked,
      fixtureFailures: fixtureResult.failures,
      pass: testCase.expect.includes(actual) && fixtureResult.failures.length === 0,
      reasonCodes: validation.log.reasonCodes,
      latencyMs: 0,
      ast,
    };
    results.push(result);
    printResult(result, `${index + 1}/${selected.length}`);
  }
} else {
  for (const [index, testCase] of selected.entries()) {
    const text = testCase.text;
    const interpret = await callPreflight(baseUrl, { phase: "interpret", text });
    const interpretation = interpret.terminal?.interpretation ?? null;
    const approvable = Boolean(interpretation) && interpretation.needsClarification === false;
    const compile = await callPreflight(baseUrl, {
      phase: "compile",
      text,
      ...(approvable ? { approvedInterpretation: toApprovedInterpretation(interpretation) } : {}),
    });
    const preflight = compile.terminal?.preflight ?? null;
    const actual = classify(preflight, compile.status);
    const fixtureResult = verifyFixtures(testCase, preflight?.ast ?? null);
    const result = {
      id: testCase.id,
      text,
      actual,
      expected: testCase.expect,
      fixtureChecks: fixtureResult.checked,
      fixtureFailures: fixtureResult.failures,
      pass: testCase.expect.includes(actual) && fixtureResult.failures.length === 0,
      approvedInterpretationSent: approvable,
      interpretNeedsClarification: interpretation?.needsClarification ?? null,
      interpretClarificationQuestions: interpretation?.clarificationQuestions ?? [],
      interpretClarityNote: interpretation?.clarityNote ?? null,
      interpretDealerMessage: interpretation?.dealerMessage ?? null,
      officialInterpretation: interpretation?.officialInterpretation ?? null,
      decision: preflight?.decision ?? null,
      needsClarification: preflight?.needsClarification ?? null,
      reproposalBlocked: preflight?.reproposalBlocked ?? null,
      guardianChecked: preflight?.guardianChecked ?? null,
      guardianGrounded: preflight?.guardianGrounded ?? null,
      escalated: preflight?.escalated ?? null,
      finalConfidence: preflight?.finalConfidence ?? null,
      difficultyClass: preflight?.difficultyClass ?? null,
      reasonCodes: preflight?.reasonCodes ?? null,
      reasonSummary: preflight?.reasonSummary ?? compile.transportError ?? null,
      coverage: preflight?.coverage ?? null,
      refinementQuestions: preflight?.refinementQuestions ?? [],
      suggestedRewrites: preflight?.suggestedRewrites ?? [],
      rejectedCompilerAttempts: preflight?.rejectedCompilerAttempts ?? [],
      interpretStages: interpret.stages,
      compileStages: compile.stages,
      latencyMs: interpret.ms + compile.ms,
      ast: preflight?.ast ?? null,
    };
    results.push(result);
    printResult(result, `${index + 1}/${selected.length}`);
  }
}

if (!refsOnly) {
  console.log(
    JSON.stringify({
      summary: {
        total: results.length,
        pass: results.filter((result) => result.pass).length,
        fail: results.filter((result) => !result.pass).length,
        withAst: results.filter((result) => result.ast).length,
        fixtureChecks: results.reduce((sum, result) => sum + result.fixtureChecks, 0),
        fixtureFailures: results.reduce((sum, result) => sum + result.fixtureFailures.length, 0),
      },
    }),
  );
}
