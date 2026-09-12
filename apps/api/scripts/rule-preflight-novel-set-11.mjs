// Test set 11 - four rules whose composition appears nowhere in sets 1-10, plus
// two deliberately imprecise rules used to exercise the clarification loop.
// Same method as sets 7-10: the two-phase player flow (`interpret` -> approve ->
// `compile`), a reference AST proved against boundary fixtures BEFORE the agent
// is judged, and every accepted or discarded AST executed against fixtures
// written from the ORIGINAL prompt. Agent prose is never the oracle.
//
// Capability axes chosen because no earlier set touched them (verified against
// the reference ASTs of sets 5-10: cross-place `digits`, `reduce min` over a
// `map`, `reduce product` over a `digits` array, and `intersection` compared
// against its complementary `difference` appear in none of them):
//   N1  CROSS-PLACE digit quantification: the TENS digit of the draw has to
//       show up as the UNITS digit of the guess (every earlier digit rule
//       matched a place against the same place)
//   N2  NEAREST-element ranking: `reduce min` over a map of absolute distances
//       to the drawn average (set 9 summed the distances, set 8 took a single
//       distance - neither took the minimum of a distance vector)
//   N3  PRODUCT over a derived array: `reduce product` of the units digits,
//       gated by a `forall` eligibility clause (earlier products were arith
//       multiplications of two `at` picks, never a reduce over a digit array)
//   N4  COMPLEMENTARY SET reductions: sum of the numbers the draw holds against
//       the sum of the ones it does not, i.e. the two halves of one partition
//       compared with each other
//
// Imprecise pair (clarification loop), both classes new to this set:
//   V1  PROCEDURAL rule with an undefined loop budget: the iteration itself is
//       well defined but "too many" leaves the removal threshold unstated (and
//       PRD 6.4.2 caps removals at MAX_REMOVABLE_NUMBERS, which the player
//       never named)
//   V2  MULTI-OBJECTIVE with no weighting: both metrics are objective, the
//       trade-off between them and the tie-break are not
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
// Sum 60, so the average is the exact integer 10 and no rounding convention can
// change the N2 answer.
const DRAW_LOW = [7, 8, 9, 10, 11, 15];
// A draw of single digit numbers: every tens digit is 0, which N1 needs in
// order to separate the cross-place reading from a same-place one.
const DRAW_UNITS = [1, 2, 3, 4, 5, 9];

// --- reference ASTs: expressibility is proved before the agent is judged ----
const src = (source) => ({ kind: "source", source });
const red = (op, of) => ({ kind: "reduce", op, of });
const lit = (value) => ({ kind: "lit", value });
const cmp = (op, left, right) => ({ kind: "compare", op, left, right });
const ar = (op, left, right) => ({ kind: "arith", op, left, right });
const elem = { kind: "elem" };
const outerElem = { kind: "elem", up: 1 };
const digits = (place, source) => ({ kind: "digits", place, of: src(source) });
const predicate = (node) => ({
  schemaVersion: 3,
  result: { type: "predicate", predicate: node },
});
const shared = { kind: "intersection", left: src("guess"), right: src("draw") };
const unshared = { kind: "difference", left: src("guess"), right: src("draw") };
const drawnAverage = ar("div", red("sum", src("draw")), lit(6));

const referenceAsts = {
  "N1-draw-tens-in-guess-units": predicate({
    kind: "forall",
    of: digits("tens", "draw"),
    where: {
      kind: "exists",
      of: digits("units", "guess"),
      where: cmp("eq", elem, outerElem),
    },
  }),
  "N2-nearest-to-drawn-average": {
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "min",
      tieBreak: "share_pool",
      // smallest distance from ANY single guessed number to the drawn average
      score: red("min", {
        kind: "map",
        of: src("guess"),
        expr: { kind: "abs", of: ar("sub", elem, drawnAverage) },
      }),
    },
  },
  "N3-units-digit-product-ranking": {
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "max",
      tieBreak: "share_pool",
      eligibleWhen: {
        kind: "forall",
        of: src("guess"),
        where: cmp("lt", elem, red("max", src("draw"))),
      },
      score: red("product", digits("units", "guess")),
    },
  },
  "N4-shared-sum-beats-unshared": predicate(
    cmp("gt", red("sum", shared), red("sum", unshared)),
  ),
};

const cases = [
  {
    id: "N1-draw-tens-in-guess-units",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if the tens digit of every drawn number appears as the last digit of at least one of the guessed numbers.",
    fixtures: [
      { note: "units digits 1 to 6 cover the drawn tens digits 1 to 6", guess: [11, 22, 33, 44, 55, 66], draw: DRAW, outcome: "WIN" },
      { note: "boundary: the drawn tens digit 6 is uncovered once 66 becomes 60", guess: [11, 22, 33, 44, 55, 60], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: single digit guesses are their own last digit", guess: [1, 2, 3, 4, 5, 6], draw: DRAW, outcome: "WIN" },
      { note: "discriminator: tens-against-tens would win here, cross-place loses", guess: [10, 20, 30, 40, 50, 60], draw: DRAW, outcome: "LOSE" },
      { note: "the same six numbers entered in a scrambled order", guess: [66, 11, 55, 22, 44, 33], draw: DRAW, outcome: "WIN" },
      { note: "a draw of single digit numbers needs a guess ending in 0", guess: [10, 20, 30, 40, 50, 60], draw: DRAW_UNITS, outcome: "WIN" },
      { note: "draw sensitivity: the winning ticket fails once every drawn tens digit is 0", guess: [11, 22, 33, 44, 55, 66], draw: DRAW_UNITS, outcome: "LOSE" },
      { note: "one repeated drawn tens digit still needs a cover, and there is none", guess: [22, 33, 44, 55, 66, 77], draw: [11, 12, 13, 14, 15, 16], outcome: "LOSE" },
    ],
  },
  {
    id: "N2-nearest-to-drawn-average",
    kind: "ranking",
    expect: ["VALID"],
    text: "The winning ticket is the one holding the number closest to the average of the six drawn numbers, and tickets that are equally close share the prize equally.",
    rankingFixtures: [
      {
        note: "A holds the average itself, B is five away",
        draw: DRAW,
        entries: { A: [35, 1, 2, 3, 4, 5], B: [30, 40, 1, 2, 3, 4] },
        winners: ["A"],
      },
      {
        note: "two tickets five away from the average share it",
        draw: DRAW,
        entries: { A2: [30, 1, 2, 3, 4, 5], C: [40, 99, 98, 97, 96, 95] },
        winners: ["A2", "C"],
      },
      {
        note: "discriminator: nearest single number, not the smallest total distance",
        draw: DRAW,
        entries: { D: [34, 36, 33, 37, 32, 38], E: [35, 99, 98, 97, 96, 95] },
        winners: ["E"],
      },
      {
        note: "discriminator: closest to the AVERAGE, not a ticket total equal to the drawn total",
        draw: DRAW,
        entries: { F: [35, 1, 2, 3, 4, 5], G: [30, 31, 34, 36, 39, 40] },
        winners: ["F"],
      },
      {
        note: "order of entry is irrelevant: the same multiset scores the same",
        draw: DRAW,
        entries: { D: [38, 32, 37, 33, 36, 34], E: [95, 96, 97, 98, 99, 35] },
        winners: ["E"],
      },
      {
        note: "draw sensitivity: the tied pair separates against an average of 10",
        draw: DRAW_LOW,
        entries: { A2: [30, 1, 2, 3, 4, 5], C: [40, 99, 98, 97, 96, 95] },
        winners: ["A2"],
      },
    ],
  },
  {
    id: "N3-units-digit-product-ranking",
    kind: "ranking",
    expect: ["VALID"],
    text: "Among tickets whose six numbers are all below the highest drawn number, the winner is the one with the largest product of the last digits of its numbers, and tickets on the same product share the prize equally.",
    rankingFixtures: [
      {
        note: "B multiplies out to 1080 and A to 720",
        draw: DRAW,
        entries: { A: [11, 12, 13, 14, 15, 16], B: [21, 22, 23, 24, 25, 59] },
        winners: ["B"],
      },
      {
        note: "eligibility: 61 is above the highest drawn number, so the bigger product is out",
        draw: DRAW,
        entries: { A: [11, 12, 13, 14, 15, 16], C: [61, 22, 23, 24, 25, 29] },
        winners: ["A"],
      },
      {
        note: "boundary: holding the highest drawn number itself is not BELOW it",
        draw: DRAW,
        entries: { A: [11, 12, 13, 14, 15, 16], D: [60, 22, 23, 24, 25, 29] },
        winners: ["A"],
      },
      {
        note: "one number ending in 0 zeroes the whole product",
        draw: DRAW,
        entries: { A: [11, 12, 13, 14, 15, 16], E: [10, 29, 28, 27, 26, 25] },
        winners: ["A"],
      },
      {
        note: "two tickets on 720 share it",
        draw: DRAW,
        entries: { A: [11, 12, 13, 14, 15, 16], F: [21, 32, 43, 54, 15, 16] },
        winners: ["A", "F"],
      },
      {
        note: "the larger product wins when both tickets are eligible",
        draw: DRAW,
        entries: { J: [8, 7, 6, 5, 4, 3], K: [19, 18, 17, 16, 15, 14] },
        winners: ["K"],
      },
      {
        note: "draw sensitivity: the same pair flips once the highest drawn number is 9",
        draw: DRAW_UNITS,
        entries: { J: [8, 7, 6, 5, 4, 3], K: [19, 18, 17, 16, 15, 14] },
        winners: ["J"],
      },
    ],
  },
  {
    id: "N4-shared-sum-beats-unshared",
    kind: "predicate",
    expect: ["VALID"],
    text: "Add up the guessed numbers that were drawn, then add up the guessed numbers that were not drawn. The guess wins if the first total is greater than the second.",
    fixtures: [
      { note: "three big matches total 150 against 6", guess: [40, 50, 60, 1, 2, 3], draw: DRAW, outcome: "WIN" },
      { note: "one small match totals 10 against 15", guess: [10, 1, 2, 3, 4, 5], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: 60 matched against 60 unmatched is not greater", guess: [60, 5, 7, 9, 11, 28], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: no match at all makes the matched total 0", guess: [1, 2, 3, 4, 5, 6], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: an exact copy of the draw leaves nothing unmatched", guess: [10, 20, 30, 40, 50, 60], draw: DRAW, outcome: "WIN" },
      { note: "discriminator: three matches still lose to the unmatched total", guess: [10, 20, 30, 99, 98, 97], draw: DRAW, outcome: "LOSE" },
      { note: "the same winning six entered in a scrambled order", guess: [3, 60, 1, 50, 2, 40], draw: DRAW, outcome: "WIN" },
      { note: "draw sensitivity: the losing ticket wins once four of its numbers are drawn", guess: [10, 1, 2, 3, 4, 5], draw: [10, 20, 1, 2, 3, 60], outcome: "WIN" },
    ],
  },
  {
    id: "V1-vague-removal-budget",
    kind: "vague",
    expect: ["CLARIFY"],
    text: "Keep taking away your highest number until everything left is below the average of the draw. You win if you did not have to take away too many.",
  },
  {
    id: "V2-vague-multi-objective",
    kind: "vague",
    expect: ["CLARIFY"],
    text: "The best ticket is the one that balances matching the draw with keeping its total low.",
  },
];

// Round 2 is filled in after round 1, from the questions the agent asked.
// `--round2` reads it from scripts/set-11-round2.json so the round-1 evidence
// is what drives it, not a text written in advance.
function loadRound2() {
  const raw = JSON.parse(
    readFileSync(new URL("./set-11-round2.json", import.meta.url), "utf8"),
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
