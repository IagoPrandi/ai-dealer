// Test set 12 - four rules whose composition appears nowhere in sets 1-11, plus
// two deliberately imprecise rules of classes no earlier set used.
// Same method as sets 7-11, so the numbers stay comparable: the two-phase player
// flow (`interpret` -> approve -> `compile`), a reference AST proved against
// boundary fixtures BEFORE the agent is judged, and every accepted or discarded
// AST executed against fixtures written from the ORIGINAL prompt. Agent prose is
// never the oracle.
//
// Capability axes chosen because no earlier reference AST contains them:
//   N1  RESIDUE-CLASS DIVERSITY compared across BOTH sides: `distinct` over a
//       `map` of `mod`, counted for the guess and for the draw and compared.
//       Sets 6/8 counted distinct digits of the guess alone; no set ever
//       compared a derived-diversity metric of the guess against the draw's.
//   N2  MINIMAX nearest-miss ranking: `reduce max` over a `map` whose element
//       expression is itself a `reduce min` over a second `map` (binder depth
//       2, `elem up:1`). Set 11 took a min over distances to one scalar, set 9
//       summed positional distances - neither nested a reduce inside a reduce
//       over the other array.
//   N3  GAP VECTOR built with `pairs_map` over two slices of the SAME sorted
//       array, then collapsed with `range_span == 0` to say "equally spaced".
//       Set 7 counted distinct gaps; no set built an arithmetic-progression
//       test, and no set used `pairs_map` as a self-zip.
//   N4  MUTUAL SET EQUALITY of a derived view: two `forall`/`exists` clauses in
//       OPPOSITE directions over `digits(units, ...)` of both sides. Set 11 N1
//       quantified one direction across places; equality of the two digit sets
//       is new (and re-exercises the `all_draw`-over-a-derived-view class the
//       set-11 D1 repair claims to have closed).
//
// Imprecise pair (clarification loop), both classes new to this set:
//   V1  PARTIALLY specified: one fully objective clause disjoined with a vague
//       one ("at least three were drawn, OR the rest are very close"). Earlier
//       vague prompts were vague throughout; this one tests whether the agent
//       isolates the vague half instead of discarding the precise half.
//   V2  NEGATION/QUANTIFIER SCOPE over an unnamed threshold ("you do not win
//       unless none of your numbers sits too far from every drawn number"):
//       the nesting has two readings and the distance bound is never given.
// Round 2 replays each with text written from the questions the agent itself
// asked in round 1.
import { request as httpRequest } from "node:http";
import { readFileSync } from "node:fs";
import {
  evaluatePredicate,
  evaluateRankingEntry,
  resolveRankingWinners,
  ruleAstSchema,
  validateAndPrecompileRule,
} from "@tyche/rule-compiler";

const DRAW = [10, 20, 30, 40, 50, 60];
// Every drawn number is a multiple of 10: the units digits collapse to {0} and
// the residues mod 4 collapse to {0, 2}, which is what N1 and N4 need in order
// to separate their readings from the obvious ones.
const DRAW_UNITS = [1, 2, 3, 4, 5, 6];
// A draw whose two lowest numbers are adjacent, so N3's spacing threshold is 1.
const DRAW_TIGHT = [10, 11, 30, 40, 50, 60];

// --- reference ASTs: expressibility is proved before the agent is judged ----
const src = (source) => ({ kind: "source", source });
const red = (op, of) => ({ kind: "reduce", op, of });
const lit = (value) => ({ kind: "lit", value });
const cmp = (op, left, right) => ({ kind: "compare", op, left, right });
const ar = (op, left, right) => ({ kind: "arith", op, left, right });
const at = (index, of) => ({ kind: "at", index, of });
const elem = { kind: "elem" };
const outerElem = { kind: "elem", up: 1 };
const digits = (place, source) => ({ kind: "digits", place, of: src(source) });
const sortAsc = (of) => ({ kind: "sort", order: "asc", of });
const predicate = (node) => ({
  schemaVersion: 3,
  result: { type: "predicate", predicate: node },
});

// N1 - how many different remainders mod 4 a side holds
const residueClasses = (source) => ({
  kind: "distinct",
  of: { kind: "map", of: src(source), expr: ar("mod", elem, lit(4)) },
});

// N2 - distance from one guessed number (the outer binder) to its nearest
// drawn number, then the worst of those six distances
const nearestDrawnDistance = red("min", {
  kind: "map",
  of: src("draw"),
  expr: { kind: "abs", of: ar("sub", outerElem, elem) },
});

// N3 - the five gaps of the sorted guess, as a self-zip of two slices
const sortedGuess = sortAsc(src("guess"));
const gapVector = {
  kind: "pairs_map",
  left: { kind: "slice", of: sortedGuess, start: 1 },
  right: { kind: "slice", of: sortedGuess, start: 0, end: -1 },
  expr: ar("sub", { kind: "pair", side: "left" }, { kind: "pair", side: "right" }),
};

// N4 - every element of one derived digit view appears in the other
const coveredBy = (left, right) => ({
  kind: "forall",
  of: left,
  where: { kind: "exists", of: right, where: cmp("eq", elem, outerElem) },
});

const referenceAsts = {
  "N1-residue-diversity-beats-draw": predicate(
    cmp("gt", red("count", residueClasses("guess")), red("count", residueClasses("draw"))),
  ),
  "N2-minimax-nearest-miss": {
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "min",
      tieBreak: "share_pool",
      score: red("max", { kind: "map", of: src("guess"), expr: nearestDrawnDistance }),
    },
  },
  "N3-equal-spacing-above-draw-gap": predicate({
    kind: "and",
    clauses: [
      cmp("eq", red("range_span", gapVector), lit(0)),
      cmp(
        "gt",
        red("min", gapVector),
        ar("sub", at(1, sortAsc(src("draw"))), at(0, sortAsc(src("draw")))),
      ),
    ],
  }),
  "N4-units-digit-sets-equal": predicate({
    kind: "and",
    clauses: [
      coveredBy(digits("units", "draw"), digits("units", "guess")),
      coveredBy(digits("units", "guess"), digits("units", "draw")),
    ],
  }),
};

const cases = [
  {
    id: "N1-residue-diversity-beats-draw",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if its six numbers leave more different remainders when divided by four than the six drawn numbers do.",
    fixtures: [
      { note: "four residue classes against the draw's two", guess: [1, 2, 3, 4, 5, 6], draw: DRAW, outcome: "WIN" },
      { note: "boundary: exactly as many classes as the draw is not more", guess: [1, 5, 9, 13, 2, 6], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: three classes still beats two", guess: [1, 2, 4, 5, 8, 9], draw: DRAW, outcome: "WIN" },
      { note: "discriminator: six different LAST DIGITS but a single residue class", guess: [4, 8, 12, 16, 20, 24], draw: DRAW, outcome: "LOSE" },
      { note: "the winning six entered in a scrambled order", guess: [6, 5, 4, 3, 2, 1], draw: DRAW, outcome: "WIN" },
      { note: "draw sensitivity: the same guess ties a draw that holds all four classes", guess: [1, 2, 3, 4, 5, 6], draw: DRAW_UNITS, outcome: "LOSE" },
      { note: "boundary: two classes against a draw holding one", guess: [1, 2, 5, 9, 13, 17], draw: [4, 8, 12, 16, 20, 24], outcome: "WIN" },
      { note: "boundary: one class against a draw holding one", guess: [4, 8, 16, 20, 24, 28], draw: [4, 8, 12, 16, 20, 24], outcome: "LOSE" },
    ],
  },
  {
    id: "N2-minimax-nearest-miss",
    kind: "ranking",
    expect: ["VALID"],
    text: "For each of your six numbers measure the distance to the nearest drawn number. The winning ticket is the one whose largest such distance is the smallest, and tickets level on that distance share the prize equally.",
    rankingFixtures: [
      {
        note: "an exact copy of the draw has a worst distance of zero",
        draw: DRAW,
        entries: { A: [10, 20, 30, 40, 50, 60], B: [11, 21, 31, 41, 51, 61] },
        winners: ["A"],
      },
      {
        note: "two tickets whose worst distance is two share it",
        draw: DRAW,
        entries: { C: [12, 22, 32, 42, 52, 62], D: [8, 18, 28, 38, 48, 58] },
        winners: ["C", "D"],
      },
      {
        note: "discriminator: worst distance, not the total distance",
        draw: DRAW,
        entries: { E: [10, 20, 30, 40, 50, 55], F: [12, 22, 32, 42, 52, 62] },
        winners: ["F"],
      },
      {
        note: "discriminator: worst distance, not the single closest number",
        draw: DRAW,
        entries: { G: [10, 99, 98, 97, 96, 95], H: [13, 23, 33, 43, 53, 63] },
        winners: ["H"],
      },
      {
        note: "order of entry is irrelevant: the same multiset scores the same",
        draw: DRAW,
        entries: { E: [55, 50, 40, 30, 20, 10], F: [62, 52, 42, 32, 22, 12] },
        winners: ["F"],
      },
      {
        note: "draw sensitivity: the tied pair separates once the draw moves onto C",
        draw: [12, 22, 32, 42, 52, 62],
        entries: { C: [12, 22, 32, 42, 52, 62], D: [8, 18, 28, 38, 48, 58] },
        winners: ["C"],
      },
    ],
  },
  {
    id: "N3-equal-spacing-above-draw-gap",
    kind: "predicate",
    expect: ["VALID"],
    text: "Sort your six numbers from lowest to highest. You win if they are equally spaced, and if that spacing is greater than the gap between the two lowest drawn numbers.",
    fixtures: [
      { note: "spacing 11 beats the drawn gap of 10", guess: [5, 16, 27, 38, 49, 60], draw: DRAW, outcome: "WIN" },
      { note: "boundary: spacing 10 is not greater than the drawn gap of 10", guess: [5, 15, 25, 35, 45, 55], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: one gap of 12 among gaps of 11 is not equal spacing", guess: [5, 16, 27, 38, 49, 61], draw: DRAW, outcome: "LOSE" },
      { note: "the same equally spaced six entered in a scrambled order", guess: [60, 5, 49, 16, 38, 27], draw: DRAW, outcome: "WIN" },
      { note: "spacing 12 also clears the drawn gap", guess: [1, 13, 25, 37, 49, 61], draw: DRAW, outcome: "WIN" },
      { note: "boundary: spacing 1 against a drawn gap of 1 is not greater", guess: [1, 2, 3, 4, 5, 6], draw: DRAW_TIGHT, outcome: "LOSE" },
      { note: "spacing 2 clears a drawn gap of 1", guess: [1, 3, 5, 7, 9, 11], draw: DRAW_TIGHT, outcome: "WIN" },
      { note: "draw sensitivity: the spacing-11 winner fails once the drawn gap is 15", guess: [5, 16, 27, 38, 49, 60], draw: [10, 25, 30, 40, 50, 60], outcome: "LOSE" },
    ],
  },
  {
    id: "N4-units-digit-sets-equal",
    kind: "predicate",
    expect: ["VALID"],
    text: "You win if the last digits of your six numbers are exactly the same set as the last digits of the six drawn numbers: every last digit of the draw has to appear among your numbers, and your numbers must not end in any digit the draw does not have.",
    fixtures: [
      { note: "an exact copy of the draw has the same digit set", guess: [10, 20, 30, 40, 50, 60], draw: DRAW, outcome: "WIN" },
      { note: "a different six with the same single digit still matches", guess: [70, 80, 90, 100, 10, 20], draw: DRAW, outcome: "WIN" },
      { note: "boundary: one number ending in 1 adds a digit the draw lacks", guess: [10, 20, 30, 40, 50, 61], draw: DRAW, outcome: "LOSE" },
      { note: "all six digit classes covered both ways", guess: [11, 22, 33, 44, 55, 66], draw: DRAW_UNITS, outcome: "WIN" },
      { note: "boundary: the drawn digit 6 is left uncovered", guess: [11, 22, 33, 44, 55, 65], draw: DRAW_UNITS, outcome: "LOSE" },
      { note: "the covering six entered in a scrambled order", guess: [66, 11, 55, 22, 44, 33], draw: DRAW_UNITS, outcome: "WIN" },
      { note: "one-direction discriminator: the draw's digits are covered but the guess adds a 2", guess: [10, 20, 30, 41, 52, 60], draw: [10, 20, 30, 41, 50, 60], outcome: "LOSE" },
      { note: "draw sensitivity: the same guess matches once the draw itself ends in 2", guess: [10, 20, 30, 41, 52, 60], draw: [10, 20, 32, 41, 50, 60], outcome: "WIN" },
    ],
  },
  {
    id: "V1-vague-half-specified",
    kind: "vague",
    expect: ["CLARIFY"],
    text: "You win if at least three of your numbers were drawn, or if the rest of them are very close to the drawn numbers.",
  },
  {
    id: "V2-vague-negation-scope",
    kind: "vague",
    expect: ["CLARIFY"],
    text: "You do not win unless none of your numbers sits too far from every drawn number.",
  },
];

// Round 2 is filled in after round 1, from the questions the agent asked.
// `--round2` reads it from scripts/set-12-round2.json so the round-1 evidence
// is what drives it, not a text written in advance.
function loadRound2() {
  const raw = JSON.parse(
    readFileSync(new URL("./set-12-round2.json", import.meta.url), "utf8"),
  );
  for (const entry of raw) {
    if (entry.fixturesFrom) {
      const source = cases.find(({ id }) => id === entry.fixturesFrom);
      entry.fixtures = source.fixtures;
      entry.rankingFixtures = source.rankingFixtures;
    }
    if (entry.referenceFrom) {
      referenceAsts[entry.id] = referenceAsts[entry.referenceFrom];
    } else if (entry.referenceAst) {
      referenceAsts[entry.id] = entry.referenceAst;
    }
  }
  return raw;
}

function classify(preflight, status, transportError) {
  if (status === 400 && transportError) {
    try {
      if (JSON.parse(transportError).error === "missing_approved_interpretation") {
        // Interpret already established that player input is still required.
        // The compile boundary must now refuse to invent the missing intent.
        return "CLARIFY";
      }
    } catch {
      // A non-JSON transport failure is still a block below.
    }
  }
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

// Streamed over `node:http` rather than `fetch`: a compile chain regularly runs
// past undici's default five-minute `bodyTimeout`, which aborted whole runs in
// set 7. `node:http` lets the idle timeout be disabled outright.
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
const corpus = round2 ? loadRound2() : cases;
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

const verifyRejected = process.argv.includes("--verify-rejected");

if (verifyRejected) {
  // Executes every candidate AST the pipeline DISCARDED against the same
  // fixtures, so a refusal can be told apart from a wrong reading.
  const file = process.argv.find((argument) => argument.endsWith(".ndjson"));
  const corpusById = new Map([...cases, ...(round2 ? loadRound2() : [])].map((c) => [c.id, c]));
  const ndjsonLines = readFileSync(file, "utf8")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const line of ndjsonLines) {
    const record = JSON.parse(line);
    if (record.summary) continue;
    const testCase = corpusById.get(record.id);
    if (!testCase || testCase.kind === "vague") continue;
    for (const [index, attempt] of (record.rejectedCompilerAttempts ?? []).entries()) {
      const ast = attempt.candidate?.ast ?? null;
      if (!ast) continue;
      const parsed = ruleAstSchema.safeParse(ast);
      const fixtureResult = verifyFixtures(testCase, parsed.success ? ast : null);
      console.log(
        JSON.stringify({
          id: record.id,
          attempt: index,
          status: attempt.status ?? null,
          decision: attempt.decision ?? null,
          reasonCodes: attempt.reasonCodes ?? null,
          schemaValid: parsed.success,
          fixtureChecks: fixtureResult.checked,
          fixtureFailures: fixtureResult.failures,
          failedStages: (attempt.stages ?? [])
            .filter((stage) => stage.status === "failed")
            .map((stage) => ({ stage: stage.stage, detail: (stage.detail ?? "").slice(0, 300) })),
        }),
      );
    }
  }
} else if (refsOnly) {
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
      officialInterpretation: validation.artifact?.officialInterpretation ?? null,
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
    const actual = classify(preflight, compile.status, compile.transportError);
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
      // Recorded because this is the text the compiler re-screens for external
      // dependencies and ambiguity: a paraphrase can carry a violation the
      // player's own wording never had (set-11 D3).
      interpretNormalizedText: interpretation?.normalizedText ?? null,
      interpretAddedOperationalClauses: interpretation?.addedOperationalClauses ?? [],
      interpretClarificationQuestions: interpretation?.clarificationQuestions ?? [],
      interpretClarityNote: interpretation?.clarityNote ?? null,
      interpretDealerMessage: interpretation?.dealerMessage ?? null,
      interpretSuggestedRewrites: interpretation?.suggestedRewrites ?? [],
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
      compileOfficialInterpretation: preflight?.officialInterpretation ?? null,
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
