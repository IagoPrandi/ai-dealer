// Test set 8 - four rules whose composition appears nowhere in sets 1-7, plus
// two deliberately imprecise rules used to exercise the clarification loop.
// Same method as set 7: the two-phase player flow (`interpret` -> approve ->
// `compile`), every accepted AST executed against boundary fixtures written
// from the ORIGINAL prompt before the run. Agent prose is never the oracle.
//
// Capability axes chosen because no earlier set touched them:
//   N1  tiered per-element scoring: `map` + nested `ite` over guess, where the
//       inner branch is an `exists` over the draw -> a ranking whose score is a
//       weighted point total, not a count
//   N2  a count threshold measured against a DERIVED draw statistic (the mean),
//       conjoined with an extreme-value clause
//   N3  set algebra at the DIGIT level: distinctness of the units digits of the
//       guess plus the cardinality of their intersection with the draw's
//   N4  min-direction ranking on |own spread - draw spread| (`range_span` twice
//       inside `abs`) gated by a NEGATIVE membership eligibility clause
//
// Imprecise pair (clarification loop), both classes new to this set:
//   V1  two undefined magnitudes AND an undefined comparison target
//       ("a decent number", "noticeably bigger", "than the drawn ones")
//   V2  an undefined branch condition plus a self-reference to an unstated
//       default ("mostly high", "the usual applies")
// Round 2 replays each with text written from the questions the agent itself
// asked in round 1.
import { request as httpRequest } from "node:http";
import {
  evaluatePredicate,
  evaluateRankingEntry,
  resolveRankingWinners,
  ruleAstSchema,
  validateAndPrecompileRule,
} from "@tyche/rule-compiler";

const DRAW = [10, 20, 30, 40, 50, 60];
// Sum 210 = 6 x 35, so the mean is an integer and `sum/6` truncation cannot
// make two faithful encodings of N2 disagree.
const DRAW_HIGH = [40, 50, 60, 70, 80, 90];
// Units digits {0, 3, 5}: leaves seven non-draw digits, so N3's second clause
// is not implied by its first (a tautological clause would not be a test).
const DRAW_DIGITS = [10, 20, 33, 45, 50, 60];

// --- reference ASTs: expressibility is proved before the agent is judged ----
const src = (source) => ({ kind: "source", source });
const red = (op, of) => ({ kind: "reduce", op, of });
const lit = (value) => ({ kind: "lit", value });
const cmp = (op, left, right) => ({ kind: "compare", op, left, right });
const ar = (op, left, right) => ({ kind: "arith", op, left, right });
const abs = (of) => ({ kind: "abs", of });
const predicate = (node) => ({
  schemaVersion: 3,
  result: { type: "predicate", predicate: node },
});
const unitsDigits = (source) => ({
  kind: "distinct",
  of: { kind: "digits", place: "units", of: src(source) },
});

const referenceAsts = {
  "N1-tiered-point-scoring": {
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "max",
      tieBreak: "share_pool",
      score: red("sum", {
        kind: "map",
        of: src("guess"),
        expr: {
          kind: "ite",
          if: { kind: "contains", array: src("draw"), value: { kind: "elem" } },
          then: lit(3),
          else: {
            kind: "ite",
            if: {
              kind: "exists",
              of: src("draw"),
              where: cmp(
                "lte",
                abs(ar("sub", { kind: "elem", up: 0 }, { kind: "elem", up: 1 })),
                lit(2),
              ),
            },
            then: lit(1),
            else: lit(0),
          },
        },
      }),
    },
  },
  "N2-count-above-draw-mean": predicate({
    kind: "and",
    clauses: [
      cmp(
        "gte",
        red("count", {
          kind: "filter",
          of: src("guess"),
          where: cmp(
            "gt",
            { kind: "elem" },
            ar("div", red("sum", src("draw")), lit(6)),
          ),
        }),
        lit(4),
      ),
      cmp("lt", red("min", src("guess")), red("min", src("draw"))),
    ],
  }),
  "N3-distinct-units-digits": predicate({
    kind: "and",
    clauses: [
      cmp("eq", red("count", unitsDigits("guess")), lit(6)),
      cmp(
        "gte",
        red("count", {
          kind: "intersection",
          left: unitsDigits("guess"),
          right: unitsDigits("draw"),
        }),
        lit(2),
      ),
    ],
  }),
  "N4-closest-spread-ranking": {
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "min",
      tieBreak: "share_pool",
      eligibleWhen: cmp(
        "eq",
        red("count", {
          kind: "intersection",
          left: src("guess"),
          right: src("draw"),
        }),
        lit(0),
      ),
      score: abs(
        ar("sub", red("range_span", src("guess")), red("range_span", src("draw"))),
      ),
    },
  },
};

const cases = [
  {
    id: "N1-tiered-point-scoring",
    kind: "ranking",
    expect: ["VALID"],
    text: "Each of your numbers that was drawn is worth 3 points, and each of your numbers that was not drawn but is within 2 of a drawn number is worth 1 point. The ticket with the most points wins, and tickets on the same total split it equally.",
    rankingFixtures: [
      {
        note: "six exact hits (18) beat six near misses (6)",
        draw: DRAW,
        entries: { A: [10, 20, 30, 40, 50, 60], B: [11, 21, 31, 41, 51, 61] },
        winners: ["A"],
      },
      {
        note: "discriminator: a plain count of qualifying numbers would pick B, the tiered score picks A",
        draw: DRAW,
        entries: { A: [10, 20, 30, 1, 2, 3], B: [11, 12, 19, 21, 29, 31] },
        winners: ["A"],
      },
      {
        note: "boundary: distance exactly 2 scores, distance 3 scores nothing",
        draw: DRAW,
        entries: { A: [12, 22, 32, 42, 52, 62], B: [13, 23, 33, 43, 53, 63] },
        winners: ["A"],
      },
      {
        note: "a drawn number is worth 3, never 3 plus 1",
        draw: DRAW,
        entries: { A: [10, 1, 2, 3, 4, 5], B: [11, 21, 31, 1, 2, 3] },
        winners: ["A", "B"],
      },
      {
        note: "nobody scores, so every ticket ties at zero",
        draw: DRAW,
        entries: { A: [1, 2, 3, 4, 5, 6], B: [70, 71, 72, 73, 74, 75] },
        winners: ["A", "B"],
      },
      {
        note: "draw sensitivity: the same two tickets change places under another draw",
        draw: [11, 12, 19, 21, 29, 31],
        entries: { A: [10, 20, 30, 1, 2, 3], B: [11, 12, 19, 21, 29, 31] },
        winners: ["B"],
      },
    ],
  },
  {
    id: "N2-count-above-draw-mean",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if at least four of its numbers are strictly greater than the average of the six drawn numbers, and its smallest number is below the smallest drawn number.",
    fixtures: [
      { note: "five numbers above the mean 35 and a 5 below the lowest drawn 10", guess: [5, 36, 37, 38, 39, 40], draw: DRAW, outcome: "WIN" },
      { note: "boundary: 35 equals the mean and does not count, four others do", guess: [5, 35, 36, 37, 38, 39], draw: DRAW, outcome: "WIN" },
      { note: "only three numbers above the mean", guess: [5, 34, 35, 36, 37, 38], draw: DRAW, outcome: "LOSE" },
      { note: "five above the mean but nothing below the lowest drawn number", guess: [11, 36, 37, 38, 39, 40], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: 9 is below the lowest drawn 10", guess: [9, 36, 37, 38, 39, 40], draw: DRAW, outcome: "WIN" },
      { note: "boundary: 10 is not below the lowest drawn 10", guess: [10, 36, 37, 38, 39, 41], draw: DRAW, outcome: "LOSE" },
      { note: "draw sensitivity: the same winning guess fails against a higher draw (mean 65)", guess: [5, 36, 37, 38, 39, 40], draw: DRAW_HIGH, outcome: "LOSE" },
      { note: "high draw: four numbers above the mean 65 and a 5 below the lowest drawn 40", guess: [5, 66, 67, 68, 69, 70], draw: DRAW_HIGH, outcome: "WIN" },
    ],
  },
  {
    id: "N3-distinct-units-digits",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if its six numbers all end in a different last digit, and at least two of those last digits also appear as the last digit of one of the drawn numbers.",
    fixtures: [
      { note: "last digits 0,3,5,1,2,4 all different and three of them are drawn last digits", guess: [10, 13, 15, 21, 22, 24], draw: DRAW_DIGITS, outcome: "WIN" },
      { note: "boundary: exactly two shared last digits", guess: [10, 13, 21, 22, 24, 26], draw: DRAW_DIGITS, outcome: "WIN" },
      { note: "only one shared last digit", guess: [10, 21, 22, 24, 26, 27], draw: DRAW_DIGITS, outcome: "LOSE" },
      { note: "two numbers end in 0, so the last digits are not all different", guess: [10, 20, 13, 15, 21, 22], draw: DRAW_DIGITS, outcome: "LOSE" },
      { note: "no shared last digit at all", guess: [1, 2, 4, 6, 7, 8], draw: [10, 33, 45, 50, 60, 70], outcome: "LOSE" },
      { note: "same guess given unsorted", guess: [24, 10, 22, 13, 21, 15], draw: DRAW_DIGITS, outcome: "WIN" },
      { note: "draw sensitivity: the one-shared-digit guess wins once the draw ends in 1 and 2", guess: [10, 21, 22, 24, 26, 27], draw: [10, 31, 42, 45, 50, 60], outcome: "WIN" },
    ],
  },
  {
    id: "N4-closest-spread-ranking",
    kind: "ranking",
    expect: ["VALID"],
    text: "The winning ticket is the one whose spread, its highest number minus its lowest number, comes closest to the spread of the draw. Only tickets holding none of the drawn numbers are eligible, and tickets that are equally close split it equally.",
    rankingFixtures: [
      {
        note: "spread 50 matches the draw spread 50 exactly",
        draw: DRAW,
        entries: { A: [1, 2, 3, 4, 5, 51], B: [1, 2, 3, 4, 5, 45] },
        winners: ["A"],
      },
      {
        note: "eligibility bites: the exact-spread ticket holds a drawn number",
        draw: DRAW,
        entries: { A: [10, 2, 3, 4, 5, 60], B: [1, 2, 3, 4, 5, 45] },
        winners: ["B"],
      },
      {
        note: "nobody is eligible, so nobody wins",
        draw: DRAW,
        entries: { A: [10, 2, 3, 4, 5, 51], B: [1, 2, 3, 4, 20, 45] },
        winners: [],
      },
      {
        note: "equally close from both sides split it",
        draw: DRAW,
        entries: { A: [1, 2, 3, 4, 5, 45], B: [1, 2, 3, 4, 5, 57] },
        winners: ["A", "B"],
      },
      {
        note: "closest wins even when nobody is exact",
        draw: DRAW,
        entries: { A: [1, 2, 3, 4, 5, 49], B: [1, 2, 3, 4, 5, 41], C: [1, 2, 3, 4, 5, 71] },
        winners: ["A"],
      },
      {
        note: "draw sensitivity: a narrower draw makes the narrow ticket win",
        draw: [11, 12, 13, 14, 15, 16],
        entries: { A: [1, 2, 3, 4, 5, 51], B: [21, 22, 23, 24, 25, 26] },
        winners: ["B"],
      },
    ],
  },
  {
    id: "V1-vague-decent-number-bigger",
    kind: "vague",
    expect: ["CLARIFY"],
    text: "A guess wins if a decent number of its numbers are noticeably bigger than the drawn ones.",
  },
  {
    id: "V2-vague-branch-and-default",
    kind: "vague",
    expect: ["CLARIFY"],
    text: "If the draw comes out mostly high, a guess wins by staying low; otherwise the usual applies.",
  },
];

// Round 2 is filled in after round 1, from the questions the agent asked.
// `--round2` reads it from scripts/set-8-round2.json so the round-1 evidence
// is what drives it, not a text written in advance.
import { readFileSync } from "node:fs";

function loadRound2() {
  const raw = JSON.parse(
    readFileSync(new URL("./set-8-round2.json", import.meta.url), "utf8"),
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
