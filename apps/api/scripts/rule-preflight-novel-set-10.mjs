// Test set 10 - four rules whose composition appears nowhere in sets 1-9, plus
// two deliberately imprecise rules used to exercise the clarification loop.
// Same method as sets 7/8/9: the two-phase player flow (`interpret` -> approve ->
// `compile`), a reference AST proved against boundary fixtures BEFORE the agent
// is judged, and every accepted or discarded AST executed against fixtures
// written from the ORIGINAL prompt. Agent prose is never the oracle.
//
// Capability axes chosen because no earlier set touched them (verified by
// grepping the reference ASTs of sets 5-9: `at`, `difference`, `reverse` and a
// nested binder with `elem up:1` appear in none of them):
//   N1  positional SELECTION with `at` on both sides - the second largest and
//       the second smallest, not the extremes every earlier set used
//   N2  set SUBTRACTION (`difference`) as the subject of the rule: a universal
//       property over "your numbers that the draw does not hold", plus a
//       non-emptiness clause that makes the vacuous-forall case a loss
//   N3  MIRRORED pairing: guess ascending zipped against draw DESCENDING, then
//       a counted threshold over the pair sums (every earlier zip was
//       same-direction or shifted)
//   N4  max-ranking whose score needs a NESTED binder with an outer reference
//       (`elem up:1`): count of guess numbers that divide some drawn number
//
// Imprecise pair (clarification loop), both classes new to this set:
//   V1  REFERENTIAL ambiguity, not an undefined magnitude: every threshold is
//       objective but the pronoun "it" has three possible antecedents
//   V2  an undefined COUNT idiom ("a couple"), an undefined margin ("just
//       under") and an undefined PAIRING ("the drawn ones" - which one?)
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
// Holds odd drawn numbers, so N2 can separate "every leftover is even" from the
// much simpler "every number you picked is even".
const DRAW_ODD = [11, 33, 55, 20, 40, 60];

// --- reference ASTs: expressibility is proved before the agent is judged ----
const src = (source) => ({ kind: "source", source });
const red = (op, of) => ({ kind: "reduce", op, of });
const lit = (value) => ({ kind: "lit", value });
const cmp = (op, left, right) => ({ kind: "compare", op, left, right });
const ar = (op, left, right) => ({ kind: "arith", op, left, right });
const elem = { kind: "elem" };
const outerElem = { kind: "elem", up: 1 };
const predicate = (node) => ({
  schemaVersion: 3,
  result: { type: "predicate", predicate: node },
});
const at = (index, of) => ({ kind: "at", index, of });
const sorted = (order, source) => ({ kind: "sort", order, of: src(source) });
// The numbers you picked that the draw does not hold.
const leftovers = { kind: "difference", left: src("guess"), right: src("draw") };

const referenceAsts = {
  "N1-second-largest-and-second-smallest": predicate({
    kind: "and",
    clauses: [
      cmp("gt", at(1, sorted("desc", "guess")), at(1, sorted("desc", "draw"))),
      cmp("lt", at(1, sorted("asc", "guess")), at(1, sorted("asc", "draw"))),
    ],
  }),
  "N2-leftovers-all-even": predicate({
    kind: "and",
    clauses: [
      cmp("gte", red("count", leftovers), lit(1)),
      {
        kind: "forall",
        of: leftovers,
        where: cmp("eq", ar("mod", elem, lit(2)), lit(0)),
      },
    ],
  }),
  "N3-mirrored-pair-sums": predicate(
    cmp(
      "gte",
      red("count", {
        kind: "filter",
        of: {
          kind: "pairs_map",
          left: sorted("asc", "guess"),
          right: sorted("desc", "draw"),
          expr: ar(
            "add",
            { kind: "pair", side: "left" },
            { kind: "pair", side: "right" },
          ),
        },
        where: cmp("gt", elem, lit(70)),
      }),
      lit(4),
    ),
  ),
  "N4-divisor-count-ranking": {
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "max",
      tieBreak: "share_pool",
      // count of guess numbers g such that some drawn number d has d mod g == 0
      score: red("count", {
        kind: "filter",
        of: src("guess"),
        where: {
          kind: "exists",
          of: src("draw"),
          where: cmp("eq", ar("mod", elem, outerElem), lit(0)),
        },
      }),
    },
  },
};

const cases = [
  {
    id: "N1-second-largest-and-second-smallest",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if its second largest number is greater than the second largest drawn number and its second smallest number is less than the second smallest drawn number.",
    fixtures: [
      { note: "51 beats the second largest drawn 50 and 19 is under the second smallest drawn 20", guess: [99, 51, 31, 30, 19, 5], draw: DRAW, outcome: "WIN" },
      { note: "boundary: the second largest ties the drawn 50", guess: [99, 50, 31, 30, 19, 5], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: the second smallest ties the drawn 20", guess: [99, 51, 31, 30, 20, 5], draw: DRAW, outcome: "LOSE" },
      { note: "discriminator: a huge maximum does not help, the SECOND largest is 45", guess: [99, 45, 44, 43, 19, 5], draw: DRAW, outcome: "LOSE" },
      { note: "discriminator: a tiny minimum does not help, the SECOND smallest is 25", guess: [99, 51, 31, 30, 25, 1], draw: DRAW, outcome: "LOSE" },
      { note: "the same six numbers entered in a scrambled order", guess: [19, 99, 5, 31, 51, 30], draw: DRAW, outcome: "WIN" },
      { note: "draw sensitivity: the winning ticket fails against a draw of tiny numbers", guess: [99, 51, 31, 30, 19, 5], draw: [1, 2, 3, 4, 5, 6], outcome: "LOSE" },
    ],
  },
  {
    id: "N2-leftovers-all-even",
    kind: "predicate",
    expect: ["VALID"],
    text: "Take the numbers in your guess that the draw does not hold. You win if there is at least one such number and every one of them is even.",
    fixtures: [
      { note: "the four leftovers 2, 4, 6 and 8 are all even", guess: [10, 20, 2, 4, 6, 8], draw: DRAW, outcome: "WIN" },
      { note: "one odd leftover, 7, is enough to lose", guess: [10, 20, 2, 4, 6, 7], draw: DRAW, outcome: "LOSE" },
      { note: "boundary: exactly one leftover and it is even", guess: [10, 20, 30, 40, 50, 2], draw: DRAW, outcome: "WIN" },
      { note: "boundary: an exact copy of the draw leaves no leftover at all", guess: [10, 20, 30, 40, 50, 60], draw: DRAW, outcome: "LOSE" },
      { note: "discriminator: the odd picks 11 and 33 are drawn, so they are not leftovers", guess: [11, 33, 2, 4, 6, 8], draw: DRAW_ODD, outcome: "WIN" },
      { note: "six odd leftovers", guess: [1, 3, 5, 7, 9, 11], draw: DRAW, outcome: "LOSE" },
      { note: "draw sensitivity: the same losing ticket wins once 7 is drawn", guess: [10, 20, 2, 4, 6, 7], draw: [7, 1, 3, 5, 9, 11], outcome: "WIN" },
    ],
  },
  {
    id: "N3-mirrored-pair-sums",
    kind: "predicate",
    expect: ["VALID"],
    text: "Sort your numbers from lowest to highest and the drawn numbers from highest to lowest, then pair them off in that order. You win if at least four of the six pairs add up to more than 70.",
    fixtures: [
      { note: "all six pairs total 80", guess: [20, 30, 40, 50, 60, 70], draw: DRAW, outcome: "WIN" },
      { note: "boundary: exactly four pairs clear 70, the other two land on 70", guess: [11, 21, 31, 41, 50, 60], draw: DRAW, outcome: "WIN" },
      { note: "boundary: one number lower and only three pairs clear 70", guess: [11, 21, 31, 40, 50, 60], draw: DRAW, outcome: "LOSE" },
      { note: "discriminator: mirrored pairing gives four, same-direction pairing would give three", guess: [31, 32, 33, 34, 35, 80], draw: DRAW, outcome: "WIN" },
      { note: "the lowest possible ticket clears nothing", guess: [1, 2, 3, 4, 5, 6], draw: DRAW, outcome: "LOSE" },
      { note: "the same winning six entered unsorted", guess: [60, 20, 70, 30, 50, 40], draw: DRAW, outcome: "WIN" },
      { note: "draw sensitivity: the boundary winner fails against a draw of tiny numbers", guess: [11, 21, 31, 41, 50, 60], draw: [1, 2, 3, 4, 5, 6], outcome: "LOSE" },
    ],
  },
  {
    id: "N4-divisor-count-ranking",
    kind: "ranking",
    expect: ["VALID"],
    text: "The ticket holding the most numbers that divide exactly into at least one drawn number wins, and tickets level on that count share the prize equally.",
    rankingFixtures: [
      {
        note: "B has five divisors of a drawn number, A has four",
        draw: DRAW,
        entries: { A: [1, 2, 5, 10, 7, 11], B: [3, 4, 6, 8, 9, 12] },
        winners: ["B"],
      },
      {
        note: "two tickets on four divisors each share it",
        draw: DRAW,
        entries: { A: [1, 2, 5, 10, 7, 11], C: [1, 2, 5, 20, 7, 13] },
        winners: ["A", "C"],
      },
      {
        note: "order of entry is irrelevant: the same multiset scores the same",
        draw: DRAW,
        entries: { A: [11, 7, 10, 5, 2, 1], C: [13, 7, 20, 5, 2, 1] },
        winners: ["A", "C"],
      },
      {
        note: "discriminator: six divisors and zero matches beats three matches",
        draw: DRAW,
        entries: { D: [3, 4, 6, 8, 12, 15], E: [10, 20, 30, 7, 11, 13] },
        winners: ["D"],
      },
      {
        note: "discriminator: direction matters - 100 and 80 are divisible BY drawn numbers but divide none",
        draw: DRAW,
        entries: { F: [100, 80, 7, 11, 13, 17], G: [3, 7, 11, 13, 17, 19] },
        winners: ["G"],
      },
      {
        note: "draw sensitivity: the tied pair separates against a draw of odd numbers",
        draw: [9, 13, 17, 19, 23, 29],
        entries: { A: [1, 2, 5, 10, 7, 11], C: [1, 2, 5, 20, 7, 13] },
        winners: ["C"],
      },
    ],
  },
  {
    id: "V1-vague-ambiguous-antecedent",
    kind: "vague",
    expect: ["CLARIFY"],
    text: "The ticket with the most matched numbers wins, unless it is even, in which case the fewest matched numbers wins.",
  },
  {
    id: "V2-vague-couple-just-under",
    kind: "vague",
    expect: ["CLARIFY"],
    text: "A guess wins if a couple of its numbers are just under the drawn ones.",
  },
];
// Round 2 is filled in after round 1, from the questions the agent asked.
// `--round2` reads it from scripts/set-10-round2.json so the round-1 evidence
// is what drives it, not a text written in advance.
import { readFileSync } from "node:fs";

function loadRound2() {
  const raw = JSON.parse(
    readFileSync(new URL("./set-10-round2.json", import.meta.url), "utf8"),
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
