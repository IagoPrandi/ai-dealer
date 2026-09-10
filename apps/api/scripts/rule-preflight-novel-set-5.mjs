// Test set 5 - four rules with no precedent in sets 1-4, driven through the same
// two-phase flow the Create screen uses (`interpret` -> approve -> `compile`) so
// the escalation branch and the approved-interpretation branch are exercised as
// players actually reach them. Every accepted AST is executed against boundary
// fixtures written from the ORIGINAL prompt; prose is never the oracle.
import {
  evaluatePredicate,
  evaluateRankingEntry,
  resolveRankingWinners,
  validateAndPrecompileRule,
} from "@tyche/rule-compiler";

const DRAW = [10, 20, 30, 40, 50, 60];

const cases = [
  {
    id: "N1-spread-gap",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if the distance between its highest and lowest number is at least 20 greater than the distance between the highest and lowest drawn numbers.",
    fixtures: [
      { note: "boundary: gap exactly 20", guess: [1, 2, 3, 4, 5, 71], draw: DRAW, outcome: "WIN" },
      { note: "boundary: gap 19", guess: [1, 2, 3, 4, 5, 70], draw: DRAW, outcome: "LOSE" },
      { note: "wide spread", guess: [1, 2, 3, 4, 5, 100], draw: DRAW, outcome: "WIN" },
      { note: "narrow spread", guess: [30, 31, 32, 33, 34, 35], draw: DRAW, outcome: "LOSE" },
      { note: "draw sensitivity: same guess, wider draw", guess: [1, 2, 3, 4, 5, 71], draw: [1, 2, 3, 4, 5, 100], outcome: "LOSE" },
    ],
  },
  {
    id: "N2-alternating-parity",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if its six numbers, in the order they were picked, strictly alternate between odd and even, and at least one of them also appears in the draw.",
    fixtures: [
      { note: "alternates but nothing drawn", guess: [1, 2, 3, 4, 5, 6], draw: DRAW, outcome: "LOSE" },
      { note: "alternates odd-first plus one match", guess: [1, 2, 3, 4, 5, 60], draw: DRAW, outcome: "WIN" },
      { note: "alternates even-first plus one match", guess: [10, 1, 4, 3, 6, 5], draw: DRAW, outcome: "WIN" },
      { note: "alternation breaks at the last pair", guess: [2, 1, 4, 3, 6, 10], draw: DRAW, outcome: "LOSE" },
      { note: "alternates, none drawn", guess: [2, 1, 4, 3, 6, 5], draw: DRAW, outcome: "LOSE" },
      { note: "reviewer probe from run 1", guess: [6, 5, 4, 3, 2, 1], draw: [1, 2, 3, 4, 5, 6], outcome: "WIN" },
      { note: "reviewer probe from run 2", guess: [1, 7, 8, 9, 10, 11], draw: [1, 2, 3, 4, 5, 6], outcome: "LOSE" },
    ],
  },
  {
    id: "N3-ranking-eligible-tiebreak",
    kind: "ranking",
    expect: ["VALID"],
    text: "Among tickets whose numbers add up to no more than the drawn total, the winner is the one with the most numbers matching the draw; if two tickets match the same amount, the one with the larger sum wins.",
    rankingFixtures: [
      {
        note: "tie on matches resolves on the larger sum",
        draw: DRAW,
        entries: { A: [10, 20, 30, 1, 2, 3], B: [10, 20, 30, 4, 5, 6], C: [10, 20, 1, 2, 3, 4] },
        winners: ["B"],
      },
      {
        note: "eligibility bites: the best matcher exceeds the drawn total",
        draw: DRAW,
        entries: { D: [10, 20, 30, 40, 50, 61], E: [10, 20, 1, 2, 3, 4] },
        winners: ["E"],
      },
      {
        note: "every ticket exceeds the drawn total, so nobody wins",
        draw: DRAW,
        entries: { F: [90, 91, 92, 93, 94, 95], G: [10, 20, 30, 40, 50, 61] },
        winners: [],
      },
      {
        note: "the primary criterion outranks the tiebreak",
        draw: DRAW,
        entries: { H: [10, 20, 30, 40, 1, 2], I: [10, 20, 1, 2, 3, 90] },
        winners: ["H"],
      },
    ],
  },
  {
    id: "N4-above-below-margin",
    kind: "predicate",
    expect: ["VALID"],
    text: "A guess wins if the count of its numbers above the highest drawn number exceeds the count of its numbers below the lowest drawn number by at least 2.",
    fixtures: [
      { note: "boundary: 2 above, 0 below", guess: [61, 62, 30, 31, 32, 33], draw: DRAW, outcome: "WIN" },
      { note: "boundary: 1 above, 0 below", guess: [61, 30, 31, 32, 33, 34], draw: DRAW, outcome: "LOSE" },
      { note: "4 above, 1 below", guess: [61, 62, 70, 80, 5, 30], draw: DRAW, outcome: "WIN" },
      { note: "2 above, 4 below", guess: [61, 62, 1, 2, 3, 4], draw: DRAW, outcome: "LOSE" },
      { note: "3 above, 2 below", guess: [70, 80, 90, 5, 6, 30], draw: DRAW, outcome: "LOSE" },
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

// The NDJSON transport is the only one that exposes the per-stage progress the
// session measures. Every envelope is the same value the SSE and JSON views
// carry, so reading it here does not change what the pipeline does.
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
      decision: preflight?.decision ?? null,
      needsClarification: preflight?.needsClarification ?? null,
      guardianGrounded: preflight?.guardianGrounded ?? null,
      finalConfidence: preflight?.finalConfidence ?? null,
      reasonCodes: preflight?.reasonCodes ?? null,
      reasonSummary: preflight?.reasonSummary ?? compile.transportError ?? null,
      refinementQuestions: preflight?.refinementQuestions ?? [],
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
