// Test set 6 - four rules whose composition appears nowhere in sets 1-5, in the
// deterministic pre-compiler, or in the authoring examples. Driven through the
// same two-phase flow the Create screen uses (`interpret` -> approve ->
// `compile`). Every accepted AST is executed against boundary fixtures written
// from the ORIGINAL prompt before the run; agent prose is never the oracle.
//
// Capability axes chosen because no earlier set touched them:
//   S1  multiplicative aggregate over a sorted slice vs a scaled draw aggregate
//   S2  set cardinality over a digit projection (distinct + digits) plus a
//       digit-membership conjunct
//   S3  counted pairs over a SHIFTED CROSS-ARRAY zip (guess[i] vs draw[i+1])
//   S4  min-direction ranking with a draw-relative eligibleWhen and an
//       ordered-criteria fold
import {
  evaluatePredicate,
  evaluateRankingEntry,
  resolveRankingWinners,
  validateAndPrecompileRule,
} from "@tyche/rule-compiler";

const DRAW = [10, 20, 30, 40, 50, 60];

const cases = [
  {
    id: "S1-product-two-smallest",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if the product of its two smallest numbers is at least three times the highest drawn number.",
    fixtures: [
      { note: "boundary: product exactly 180 against threshold 180", guess: [12, 15, 70, 80, 90, 95], draw: DRAW, outcome: "WIN" },
      { note: "boundary: product 168, one step under", guess: [12, 14, 70, 80, 90, 95], draw: DRAW, outcome: "LOSE" },
      { note: "comfortably above", guess: [20, 30, 40, 50, 60, 70], draw: DRAW, outcome: "WIN" },
      { note: "comfortably below", guess: [1, 2, 3, 4, 5, 6], draw: DRAW, outcome: "LOSE" },
      { note: "discriminator: two SMALLEST, not the first two picked", guess: [90, 95, 1, 2, 3, 4], draw: DRAW, outcome: "LOSE" },
      { note: "draw sensitivity: threshold rises to 183", guess: [12, 15, 70, 80, 90, 95], draw: [10, 20, 30, 40, 50, 61], outcome: "LOSE" },
      { note: "draw sensitivity: threshold falls to 177", guess: [12, 15, 70, 80, 90, 95], draw: [10, 20, 30, 40, 50, 59], outcome: "WIN" },
    ],
  },
  {
    id: "S2-distinct-tens-plus-top-tens",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if its six numbers have at least five different tens digits, and at least one of its numbers has the same tens digit as the highest drawn number.",
    fixtures: [
      { note: "boundary: exactly 5 distinct tens digits, contains a 60s number", guess: [61, 11, 12, 23, 34, 45], draw: DRAW, outcome: "WIN" },
      { note: "only 4 distinct tens digits", guess: [61, 11, 12, 23, 24, 35], draw: DRAW, outcome: "LOSE" },
      { note: "6 distinct tens digits but none matches the top drawn tens digit", guess: [11, 22, 33, 44, 55, 77], draw: DRAW, outcome: "LOSE" },
      { note: "6 distinct tens digits including the top drawn tens digit", guess: [11, 22, 33, 44, 55, 66], draw: DRAW, outcome: "WIN" },
      { note: "single-digit number carries tens digit 0", guess: [5, 11, 22, 33, 44, 60], draw: DRAW, outcome: "WIN" },
      { note: "draw sensitivity: top drawn tens digit becomes 7", guess: [61, 11, 12, 23, 34, 45], draw: [10, 20, 30, 40, 50, 70], outcome: "LOSE" },
      { note: "draw sensitivity: same guess wins when the top drawn number is in the 40s", guess: [61, 11, 12, 23, 34, 45], draw: [10, 20, 30, 41, 42, 43], outcome: "WIN" },
    ],
  },
  {
    id: "S3-shifted-cross-array-count",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if at least four of these five comparisons hold: the first guessed number is greater than the second drawn number, the second guessed number is greater than the third drawn number, and so on through the fifth guessed number being greater than the sixth drawn number.",
    fixtures: [
      { note: "boundary: exactly 4 of the 5 shifted comparisons hold", guess: [21, 31, 41, 51, 60, 1], draw: DRAW, outcome: "WIN" },
      { note: "boundary: only 3 hold", guess: [21, 31, 41, 50, 59, 1], draw: DRAW, outcome: "LOSE" },
      { note: "all 5 hold", guess: [90, 91, 92, 93, 94, 1], draw: DRAW, outcome: "WIN" },
      { note: "none hold", guess: [1, 2, 3, 4, 5, 99], draw: DRAW, outcome: "LOSE" },
      { note: "the sixth guessed number takes no part", guess: [21, 31, 41, 51, 61, 100], draw: DRAW, outcome: "WIN" },
      { note: "discriminator: same-position compare would WIN, shifted compare LOSES", guess: [15, 25, 35, 45, 55, 65], draw: DRAW, outcome: "LOSE" },
      { note: "discriminator: descending draw - same-position LOSES, shifted WINS", guess: [55, 45, 35, 25, 15, 5], draw: [60, 50, 40, 30, 20, 10], outcome: "WIN" },
    ],
  },
  {
    id: "S4-min-ranking-span-then-sum",
    kind: "ranking",
    expect: ["VALID"],
    text: "Among tickets whose six numbers are all greater than the lowest drawn number, the winner is the ticket with the smallest distance between its highest and lowest number; if two tickets have the same distance, the one with the smaller total wins.",
    rankingFixtures: [
      {
        note: "tie on the span resolves on the smaller total",
        draw: DRAW,
        entries: { A: [31, 32, 33, 34, 35, 36], B: [41, 42, 43, 44, 45, 46] },
        winners: ["A"],
      },
      {
        note: "eligibility bites: the tightest span is ineligible",
        draw: DRAW,
        entries: { C: [5, 6, 7, 8, 9, 10], D: [31, 32, 33, 34, 35, 45] },
        winners: ["D"],
      },
      {
        note: "nobody is eligible, so nobody wins",
        draw: DRAW,
        entries: { E: [1, 2, 3, 4, 5, 6], F: [2, 3, 4, 5, 6, 7] },
        winners: [],
      },
      {
        note: "the primary criterion outranks the tiebreak",
        draw: DRAW,
        entries: { G: [51, 52, 53, 54, 55, 56], H: [11, 12, 13, 14, 15, 20] },
        winners: ["G"],
      },
      {
        note: "equal span and equal total share the pool",
        draw: DRAW,
        entries: { K: [31, 32, 33, 34, 35, 45], L: [45, 35, 34, 33, 32, 31] },
        winners: ["K", "L"],
      },
      {
        note: "draw sensitivity: a higher lowest drawn number flips the winner",
        draw: [35, 40, 50, 60, 70, 80],
        entries: { A: [31, 32, 33, 34, 35, 36], B: [41, 42, 43, 44, 45, 46] },
        winners: ["B"],
      },
    ],
  },
];

function classify(preflight, status) {
  if (status !== 200 || !preflight) return "BLOCK";
  if (preflight.decision === "VALID" && !preflight.needsClarification) return "VALID";
  if (preflight.decision === "VALID" && preflight.reproposalBlocked) return "VALID";
  return "CLARIFY";
}

function verifyPredicateFixtures(ast, fixtures = []) {
  if (fixtures.length === 0) return { checked: 0, failures: [] };
  if (!ast) {
    return { checked: 0, failures: [{ reason: "accepted case returned no AST" }] };
  }
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
  if (!ast) {
    return { checked: 0, failures: [{ reason: "accepted case returned no AST" }] };
  }
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
  return testCase.kind === "ranking"
    ? verifyRankingFixtures(ast, testCase.rankingFixtures)
    : verifyPredicateFixtures(ast, testCase.fixtures);
}

// The NDJSON transport is the only one that exposes per-stage progress. Every
// envelope carries the same value the SSE and JSON views carry, so reading it
// here does not change what the pipeline does.
async function callPreflight(baseUrl, body) {
  const startedAt = Date.now();
  const stages = [];
  let response;
  try {
    response = await fetch(`${baseUrl}/rule-preflight`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(900_000),
    });
  } catch (error) {
    return { status: 0, stages, terminal: null, transportError: String(error), ms: Date.now() - startedAt };
  }
  if (!response.ok || !response.body) {
    return {
      status: response.status,
      stages,
      terminal: null,
      transportError: await response.text(),
      ms: Date.now() - startedAt,
    };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
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
        stages.push({ atMs: Date.now() - startedAt, stage: event.progress.stage, model: event.progress.model ?? null });
      } else {
        terminal = event;
      }
    }
  }
  return { status: response.status, stages, terminal, transportError: null, ms: Date.now() - startedAt };
}

// The Create screen never compiles without an approved interpretation, so the
// session replays that exact handoff instead of the bare compile call.
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
const offline = process.argv.includes("--offline");
const onlyIds = new Set(
  process.argv.slice(3).filter((argument) => !argument.startsWith("--")),
);
const selected = onlyIds.size > 0 ? cases.filter(({ id }) => onlyIds.has(id)) : cases;
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

if (offline) {
  for (const [index, testCase] of selected.entries()) {
    const validation = validateAndPrecompileRule({
      originalText: testCase.text,
      prompt: testCase.text,
      tokenCount: testCase.text.trim().split(/\s+/u).length,
    });
    const ast = validation.artifact?.ast ?? null;
    const fixtureResult = verifyFixtures(testCase, ast);
    const result = {
      id: testCase.id,
      actual: validation.decision === "VALID" ? "VALID" : "CLARIFY",
      expected: testCase.expect,
      fixtureChecks: fixtureResult.checked,
      fixtureFailures: fixtureResult.failures,
      pass: validation.decision === "VALID" && fixtureResult.failures.length === 0,
      reasonCodes: validation.log.reasonCodes,
      latencyMs: 0,
      ast,
    };
    results.push(result);
    printResult(result, `${index + 1}/${selected.length}`);
  }
} else {
  for (const [index, testCase] of selected.entries()) {
    const interpret = await callPreflight(baseUrl, { phase: "interpret", text: testCase.text });
    const interpretation = interpret.terminal?.interpretation ?? null;
    const approvable = Boolean(interpretation) && interpretation.needsClarification === false;
    const compile = await callPreflight(baseUrl, {
      phase: "compile",
      text: testCase.text,
      ...(approvable ? { approvedInterpretation: toApprovedInterpretation(interpretation) } : {}),
    });
    const preflight = compile.terminal?.preflight ?? null;
    const actual = classify(preflight, compile.status);
    const fixtureResult = verifyFixtures(testCase, preflight?.ast ?? null);
    const result = {
      id: testCase.id,
      actual,
      expected: testCase.expect,
      fixtureChecks: fixtureResult.checked,
      fixtureFailures: fixtureResult.failures,
      pass: testCase.expect.includes(actual) && fixtureResult.failures.length === 0,
      approvedInterpretationSent: approvable,
      interpretNeedsClarification: interpretation?.needsClarification ?? null,
      officialInterpretation: interpretation?.officialInterpretation ?? null,
      decision: preflight?.decision ?? null,
      needsClarification: preflight?.needsClarification ?? null,
      guardianGrounded: preflight?.guardianGrounded ?? null,
      escalated: preflight?.escalated ?? null,
      finalConfidence: preflight?.finalConfidence ?? null,
      reasonCodes: preflight?.reasonCodes ?? null,
      reasonSummary: preflight?.reasonSummary ?? compile.transportError ?? null,
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
