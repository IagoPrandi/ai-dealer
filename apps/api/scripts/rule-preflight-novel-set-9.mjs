// Test set 9 - four rules whose composition appears nowhere in sets 1-8, plus
// two deliberately imprecise rules used to exercise the clarification loop.
// Same method as sets 7/8: the two-phase player flow (`interpret` -> approve ->
// `compile`), a reference AST proved against boundary fixtures BEFORE the agent
// is judged, and every accepted or discarded AST executed against fixtures
// written from the ORIGINAL prompt. Agent prose is never the oracle.
//
// Capability axes chosen because no earlier set touched them:
//   N1  top-k positional dominance: `sort desc` + `slice` on BOTH sides, then
//       `pairs_forall` - a rule about the shape of the ticket's head, not its
//       membership
//   N2  PRD 6.7's canonical guarded transformation: double each number but keep
//       the original when the double would leave the board, THEN count draw
//       membership of the transformed array (`map` + `ite` + `filter`/`contains`)
//   N3  equality between a guess statistic and the SAME statistic of the draw
//       (counts of multiples of 3), conjoined with a `product` over a sorted
//       slice - the first cross-source count equality in any set
//   N4  min-ranking whose score carries a CONDITIONAL PENALTY term: sorted
//       positional distance plus `ite(intersects, 10, 0)`
//
// Imprecise pair (clarification loop), both classes new to this set:
//   V1  an undefined baseline ("more spread out than usual") plus an undefined
//       categorisation ("a good mix of small and large numbers")
//   V2  a subjective similarity metric with an undefined exclusion
//       ("looks most like the draw without actually copying it")
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
// Multiples of 3 in DRAW: {30, 60} = 2, and max(DRAW) = 60 - both used by N3.
// A draw whose high members are all above 50, so N2's guard branch (keep the
// original when doubling would pass 100) is the ONLY way to hit them.
const DRAW_KEEP = [10, 60, 70, 80, 90, 95];
// Contains 100 so N2's exact boundary (2 x 50 = 100 is kept, not guarded) bites.
const DRAW_100 = [20, 30, 40, 50, 60, 100];
// Three multiples of 3 and a low maximum - N3's draw-sensitivity draw.
const DRAW_THREES = [3, 6, 9, 10, 20, 25];

// --- reference ASTs: expressibility is proved before the agent is judged ----
const src = (source) => ({ kind: "source", source });
const red = (op, of) => ({ kind: "reduce", op, of });
const lit = (value) => ({ kind: "lit", value });
const cmp = (op, left, right) => ({ kind: "compare", op, left, right });
const ar = (op, left, right) => ({ kind: "arith", op, left, right });
const abs = (of) => ({ kind: "abs", of });
const elem = { kind: "elem" };
const predicate = (node) => ({
  schemaVersion: 3,
  result: { type: "predicate", predicate: node },
});
const topThreeDesc = (source) => ({
  kind: "slice",
  of: { kind: "sort", order: "desc", of: src(source) },
  start: 0,
  end: 3,
});
const multiplesOfThree = (source) => ({
  kind: "filter",
  of: src(source),
  where: cmp("eq", ar("mod", elem, lit(3)), lit(0)),
});
// x -> 2x, unless 2x would leave the 1..100 board, in which case x is kept.
const guardedDouble = {
  kind: "map",
  of: src("guess"),
  expr: {
    kind: "ite",
    if: cmp("lte", ar("mul", elem, lit(2)), lit(100)),
    then: ar("mul", elem, lit(2)),
    else: elem,
  },
};

const referenceAsts = {
  "N1-top-three-positional-dominance": predicate({
    kind: "pairs_forall",
    left: topThreeDesc("guess"),
    right: topThreeDesc("draw"),
    where: cmp(
      "gt",
      { kind: "pair", side: "left" },
      { kind: "pair", side: "right" },
    ),
  }),
  "N2-guarded-double-membership": predicate(
    cmp(
      "gte",
      red("count", {
        kind: "filter",
        of: guardedDouble,
        where: { kind: "contains", array: src("draw"), value: elem },
      }),
      lit(3),
    ),
  ),
  "N3-matching-multiples-and-product": predicate({
    kind: "and",
    clauses: [
      cmp(
        "eq",
        red("count", multiplesOfThree("guess")),
        red("count", multiplesOfThree("draw")),
      ),
      cmp(
        "gt",
        red("product", {
          kind: "slice",
          of: { kind: "sort", order: "asc", of: src("guess") },
          start: 0,
          end: 2,
        }),
        red("max", src("draw")),
      ),
    ],
  }),
  "N4-sorted-distance-with-penalty": {
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "min",
      tieBreak: "share_pool",
      score: ar(
        "add",
        red("sum", {
          kind: "pairs_map",
          left: { kind: "sort", order: "asc", of: src("guess") },
          right: { kind: "sort", order: "asc", of: src("draw") },
          expr: abs(
            ar(
              "sub",
              { kind: "pair", side: "left" },
              { kind: "pair", side: "right" },
            ),
          ),
        }),
        {
          kind: "ite",
          if: cmp(
            "gte",
            red("count", {
              kind: "intersection",
              left: src("guess"),
              right: src("draw"),
            }),
            lit(1),
          ),
          then: lit(10),
          else: lit(0),
        },
      ),
    },
  },
};

const cases = [
  {
    id: "N1-top-three-positional-dominance",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if, after sorting its own numbers and the drawn numbers from highest to lowest, each of its three highest numbers is strictly greater than the drawn number in the matching position.",
    fixtures: [
      { note: "61>60, 51>50, 41>40 at all three positions", guess: [61, 51, 41, 1, 2, 3], draw: DRAW, outcome: "WIN" },
      { note: "boundary: 60 is not strictly greater than the drawn 60", guess: [60, 51, 41, 1, 2, 3], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: the third position ties at 40", guess: [70, 60, 40, 1, 2, 3], draw: DRAW, outcome: "LOSE" },
      { note: "discriminator: a far bigger total still fails position three", guess: [99, 98, 39, 1, 2, 3], draw: DRAW, outcome: "LOSE" },
      { note: "only the top three matter, the bottom three may be tiny", guess: [61, 62, 63, 1, 2, 3], draw: DRAW, outcome: "WIN" },
      { note: "same six numbers entered in a scrambled order", guess: [3, 41, 1, 61, 2, 51], draw: DRAW, outcome: "WIN" },
      { note: "draw sensitivity: the winning ticket fails against a higher draw", guess: [61, 51, 41, 1, 2, 3], draw: [1, 2, 3, 70, 80, 90], outcome: "LOSE" },
    ],
  },
  {
    id: "N2-guarded-double-membership",
    kind: "predicate",
    expect: ["VALID"],
    text: "Double each of your numbers, but if doubling a number would take it past 100 then keep that number as it is. You win if at least three of the resulting numbers appear in the draw.",
    fixtures: [
      { note: "doubles 10, 20, 30 are all drawn", guess: [5, 10, 15, 1, 2, 3], draw: DRAW, outcome: "WIN" },
      { note: "boundary: only two doubles are drawn", guess: [5, 10, 1, 2, 3, 4], draw: DRAW, outcome: "LOSE" },
      { note: "guard discriminator: 60, 70 and 80 are kept and drawn, their doubles would not be", guess: [60, 70, 80, 1, 2, 3], draw: DRAW_KEEP, outcome: "WIN" },
      { note: "guard is not a free pass: only 60 survives as a drawn number", guess: [60, 51, 52, 1, 2, 3], draw: DRAW_KEEP, outcome: "LOSE" },
      { note: "boundary: 2 x 50 = 100 does not pass 100, so 50 is doubled", guess: [50, 10, 15, 1, 2, 3], draw: DRAW_100, outcome: "WIN" },
      { note: "the raw numbers are drawn but their doubles are not", guess: [30, 40, 50, 1, 2, 3], draw: DRAW, outcome: "LOSE" },
      { note: "draw sensitivity: the same ticket loses against an off-by-one draw", guess: [5, 10, 15, 1, 2, 3], draw: [11, 21, 31, 41, 51, 61], outcome: "LOSE" },
    ],
  },
  {
    id: "N3-matching-multiples-and-product",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if it holds exactly as many multiples of three as the draw does, and the product of its two smallest numbers is greater than the largest drawn number.",
    fixtures: [
      { note: "two multiples of three like the draw, and 9 x 11 = 99 beats 60", guess: [9, 12, 11, 13, 17, 19], draw: DRAW, outcome: "WIN" },
      { note: "boundary: 6 x 10 = 60 is not greater than the largest drawn 60", guess: [10, 6, 12, 11, 13, 17], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: 7 x 10 = 70 clears 60 with the same two multiples", guess: [10, 7, 12, 11, 13, 18], draw: DRAW, outcome: "WIN" },
      { note: "isolates the count clause: three multiples of three, product fine", guess: [12, 15, 18, 11, 13, 17], draw: DRAW, outcome: "LOSE" },
      { note: "isolates the count clause the other way: only one multiple of three", guess: [10, 7, 12, 11, 13, 17], draw: DRAW, outcome: "LOSE" },
      { note: "draw sensitivity: the three-multiples ticket wins against a draw holding three", guess: [12, 15, 18, 11, 13, 17], draw: DRAW_THREES, outcome: "WIN" },
      { note: "same winning six entered unsorted", guess: [19, 9, 17, 12, 11, 13], draw: DRAW, outcome: "WIN" },
    ],
  },
  {
    id: "N4-sorted-distance-with-penalty",
    kind: "ranking",
    expect: ["VALID"],
    text: "Line up your six numbers against the six drawn numbers from lowest to highest and add up the differences; the ticket with the smallest total wins. A ticket that holds any of the drawn numbers has 10 added to its total as a penalty, and tickets on the same total split it equally.",
    rankingFixtures: [
      {
        note: "every number one away (6) beats every number two away (12)",
        draw: DRAW,
        entries: { A: [11, 21, 31, 41, 51, 61], B: [12, 22, 32, 42, 52, 62] },
        winners: ["A"],
      },
      {
        note: "discriminator: the closer ticket loses because the penalty applies",
        draw: DRAW,
        entries: { A: [10, 21, 31, 41, 51, 61], B: [12, 22, 32, 42, 52, 62] },
        winners: ["B"],
      },
      {
        note: "equal totals from opposite sides split it",
        draw: DRAW,
        entries: { A: [11, 21, 31, 41, 51, 61], B: [9, 19, 29, 39, 49, 59] },
        winners: ["A", "B"],
      },
      {
        note: "order of entry is irrelevant: the same multiset scores the same",
        draw: DRAW,
        entries: { A: [61, 51, 41, 31, 21, 11], B: [11, 21, 31, 41, 51, 61] },
        winners: ["A", "B"],
      },
      {
        note: "an exact copy of the draw scores 0 + 10 and loses to a 6",
        draw: DRAW,
        entries: { A: [10, 20, 30, 40, 50, 60], B: [11, 21, 31, 41, 51, 61] },
        winners: ["B"],
      },
      {
        note: "draw sensitivity: a penalised near-copy still beats a far ticket",
        draw: [70, 80, 90, 91, 92, 93],
        entries: { A: [11, 21, 31, 41, 51, 61], B: [71, 81, 91, 92, 93, 94] },
        winners: ["B"],
      },
    ],
  },
  {
    id: "V1-vague-spread-and-mix",
    kind: "vague",
    expect: ["CLARIFY"],
    text: "A guess wins if it is more spread out than usual and has a good mix of small and large numbers.",
  },
  {
    id: "V2-vague-looks-like-the-draw",
    kind: "vague",
    expect: ["CLARIFY"],
    text: "The best ticket is the one that looks most like the draw without actually copying it.",
  },
];

// Round 2 is filled in after round 1, from the questions the agent asked.
// `--round2` reads it from scripts/set-9-round2.json so the round-1 evidence
// is what drives it, not a text written in advance.
import { readFileSync } from "node:fs";

function loadRound2() {
  const raw = JSON.parse(
    readFileSync(new URL("./set-9-round2.json", import.meta.url), "utf8"),
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
