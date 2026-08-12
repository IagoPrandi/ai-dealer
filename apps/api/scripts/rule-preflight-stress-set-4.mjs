import {
  evaluatePredicate,
  validateAndPrecompileRule,
} from "@tyche/rule-compiler";

const DRAW = [10, 20, 30, 40, 50, 60];

const cases = [
  {
    id: "Q1-01",
    question: 1,
    expect: ["VALID"],
    text: "Every guessed number must be within 4 of the drawn number in the same position, and at least two guessed numbers must exactly equal their drawn numbers in those positions.",
    fixtures: [
      { guess: [10, 20, 34, 44, 54, 64], draw: DRAW, outcome: "WIN" },
      { guess: [14, 24, 34, 44, 54, 64], draw: DRAW, outcome: "LOSE" },
      { guess: [10, 20, 35, 44, 54, 64], draw: DRAW, outcome: "LOSE" },
    ],
  },
  {
    id: "Q1-02",
    question: 1,
    expect: ["VALID"],
    text: "A guess wins if the sum of its numbers is at least 12 higher than the sum of the drawn numbers.",
    fixtures: [
      { guess: [10, 20, 30, 40, 50, 72], draw: DRAW, outcome: "WIN" },
      { guess: [10, 20, 30, 40, 50, 71], draw: DRAW, outcome: "LOSE" },
      { guess: [5, 15, 25, 35, 55, 63], draw: DRAW, outcome: "LOSE" },
    ],
  },
  {
    id: "Q1-03",
    question: 1,
    expect: ["VALID"],
    text: "A guess wins if the sum of its three smallest numbers is greater than the sum of the three smallest drawn numbers.",
    fixtures: [
      {
        guess: [11, 21, 31, 70, 80, 90],
        draw: [10, 20, 30, 80, 90, 100],
        outcome: "WIN",
      },
      {
        guess: [9, 20, 30, 70, 80, 90],
        draw: [10, 20, 30, 80, 90, 100],
        outcome: "LOSE",
      },
    ],
  },
  {
    id: "Q2-01",
    question: 2,
    expect: ["VALID"],
    text: "A guess wins if none of its even guessed numbers appear anywhere in the official draw.",
    fixtures: [
      { guess: [4, 6, 13, 15, 17, 19], draw: [2, 3, 5, 7, 9, 11], outcome: "WIN" },
      { guess: [2, 4, 13, 15, 17, 19], draw: [2, 3, 5, 7, 9, 11], outcome: "LOSE" },
      { guess: [4, 6, 3, 15, 17, 19], draw: [2, 3, 5, 7, 9, 11], outcome: "WIN" },
    ],
  },
  {
    id: "Q2-02",
    question: 2,
    expect: ["VALID"],
    text: "A guess wins if its number sum modulo 7 equals the official draw's number sum modulo 7.",
    fixtures: [
      { guess: [5, 15, 25, 35, 55, 75], draw: DRAW, outcome: "WIN" },
      { guess: [5, 15, 25, 35, 55, 76], draw: DRAW, outcome: "LOSE" },
    ],
  },
  {
    id: "Q2-03",
    question: 2,
    expect: ["VALID"],
    text: "A guess wins if it contains 42 and the sum of the six drawn numbers is below 150.",
    fixtures: [
      { guess: [1, 2, 3, 4, 5, 42], draw: [1, 2, 3, 4, 5, 100], outcome: "WIN" },
      { guess: [1, 2, 3, 4, 5, 41], draw: [1, 2, 3, 4, 5, 100], outcome: "LOSE" },
      { guess: [1, 2, 3, 4, 5, 42], draw: [10, 20, 30, 40, 50, 60], outcome: "LOSE" },
    ],
  },
  {
    id: "Q3-01",
    question: 3,
    expect: ["CLARIFY", "CONFIRM"],
    text: "A guess wins when every number stays within a small distance of the drawn number in the same position.",
  },
  {
    id: "Q3-02",
    question: 3,
    expect: ["CLARIFY", "CONFIRM"],
    text: "Let guesses with a better total than the draw win.",
  },
  {
    id: "Q3-03",
    question: 3,
    expect: ["CLARIFY", "CONFIRM"],
    text: "A guess wins if some of its positions match the draw exactly.",
  },
  {
    id: "Q4-01",
    question: 4,
    expect: ["VALID"],
    text: "A guess wins if all six guessed numbers are strictly greater than 10 and strictly less than 90. The official draw does not affect the result.",
    fixtures: [
      { guess: [11, 20, 30, 40, 50, 89], draw: DRAW, outcome: "WIN" },
      { guess: [10, 20, 30, 40, 50, 89], draw: DRAW, outcome: "LOSE" },
      { guess: [11, 20, 30, 40, 50, 90], draw: DRAW, outcome: "LOSE" },
    ],
  },
  {
    id: "Q4-02",
    question: 4,
    expect: ["VALID"],
    text: "A guess wins if exactly one guessed number equals the drawn number in the same position.",
    fixtures: [
      { guess: [10, 21, 31, 41, 51, 61], draw: DRAW, outcome: "WIN" },
      { guess: [10, 20, 31, 41, 51, 61], draw: DRAW, outcome: "LOSE" },
      { guess: [11, 21, 31, 41, 51, 61], draw: DRAW, outcome: "LOSE" },
    ],
  },
  {
    id: "Q4-03",
    question: 4,
    expect: ["VALID"],
    text: "A guess wins if the total absolute position-by-position difference between guess and draw is 24 or less.",
    fixtures: [
      { guess: [14, 24, 34, 44, 54, 64], draw: DRAW, outcome: "WIN" },
      { guess: [15, 24, 34, 44, 54, 64], draw: DRAW, outcome: "LOSE" },
    ],
  },
  {
    id: "Q5-01",
    question: 5,
    expect: ["CLARIFY", "CONFIRM"],
    text: "A guess wins if its numbers look harmonious beside the official draw.",
  },
  {
    id: "Q5-02",
    question: 5,
    expect: ["CLARIFY", "CONFIRM"],
    text: "A guess wins if it is a near-perfect match but not an exact match.",
  },
  {
    id: "Q5-03",
    question: 5,
    expect: ["CLARIFY", "CONFIRM"],
    text: "Reward a lucky-looking guess that also feels balanced against the draw.",
  },
  {
    id: "Q6-01",
    question: 6,
    expect: ["VALID"],
    text: "A guess wins if its total is at least ten lower than the official draw total.",
    fixtures: [
      { guess: [5, 15, 25, 35, 55, 65], draw: DRAW, outcome: "WIN" },
      { guess: [5, 15, 25, 35, 56, 65], draw: DRAW, outcome: "LOSE" },
      { guess: [10, 20, 30, 40, 50, 70], draw: DRAW, outcome: "LOSE" },
    ],
  },
  {
    id: "Q6-02",
    question: 6,
    expect: ["VALID"],
    text: "Every guessed number is within 6 of the drawn number in the same position, and at least one guessed number exactly equals the drawn number in that position.",
    fixtures: [
      { guess: [10, 26, 36, 46, 56, 66], draw: DRAW, outcome: "WIN" },
      { guess: [16, 26, 36, 46, 56, 66], draw: DRAW, outcome: "LOSE" },
      { guess: [10, 27, 36, 46, 56, 66], draw: DRAW, outcome: "LOSE" },
    ],
  },
  {
    id: "Q6-03",
    question: 6,
    expect: ["VALID"],
    text: "A guess wins if its six numbers are exactly 1, 2, 3, 4, 5 and 6 in any order and at least one drawn number is between 40 and 60, inclusive.",
    fixtures: [
      { guess: [1, 2, 3, 4, 5, 6], draw: [10, 20, 30, 40, 70, 80], outcome: "WIN" },
      { guess: [1, 2, 3, 4, 5, 7], draw: [10, 20, 30, 40, 70, 80], outcome: "LOSE" },
      { guess: [1, 2, 3, 4, 5, 6], draw: [1, 2, 3, 98, 99, 100], outcome: "LOSE" },
    ],
  },
  {
    id: "Q7-01",
    question: 7,
    expect: ["VALID"],
    text: "A guess wins if its six numbers are exactly 8, 16, 24, 32, 40 and 48 in any order. The official draw does not affect the result.",
    fixtures: [
      { guess: [8, 16, 24, 32, 40, 48], draw: DRAW, outcome: "WIN" },
      { guess: [8, 16, 24, 32, 40, 49], draw: DRAW, outcome: "LOSE" },
    ],
  },
  {
    id: "Q7-02",
    question: 7,
    expect: ["VALID"],
    text: "A guess wins if all six drawn numbers are below 40. The player's guessed numbers do not affect the result.",
    fixtures: [
      { guess: [50, 60, 70, 80, 90, 100], draw: [1, 2, 3, 4, 5, 39], outcome: "WIN" },
      { guess: [1, 2, 3, 4, 5, 6], draw: [1, 2, 3, 4, 5, 40], outcome: "LOSE" },
    ],
  },
  {
    id: "Q7-03",
    question: 7,
    expect: ["VALID"],
    text: "A guess wins if it contains the number 77. The official draw does not affect the result.",
    fixtures: [
      { guess: [1, 2, 3, 4, 5, 77], draw: DRAW, outcome: "WIN" },
      { guess: [1, 2, 3, 4, 5, 76], draw: DRAW, outcome: "LOSE" },
    ],
  },
  {
    id: "Q8-01",
    question: 8,
    expect: ["BLOCK"],
    text: "Only wallets holding more than 25 SOL at draw time can win.",
  },
  {
    id: "Q8-02",
    question: 8,
    expect: ["BLOCK"],
    text: "Only players with the Founders role in my Discord server are eligible to win.",
  },
  {
    id: "Q8-03",
    question: 8,
    expect: ["BLOCK"],
    text: "A guess wins if the SOL price is higher than 250 dollars when the draw happens.",
  },
];

function classify(preflight, status) {
  if (status >= 400) return "BLOCK";
  if (!preflight) return "ERROR";
  if (preflight.decision === "VALID" && preflight.confirmationRequired) {
    return "CONFIRM";
  }
  // A prior mandate is a product-history rejection, not a compilation verdict.
  // Keep it visible in the record, but let fixtures judge the returned AST.
  if (preflight.decision === "VALID" && preflight.reproposalBlocked) {
    return "VALID";
  }
  if (preflight.decision === "VALID" && !preflight.needsClarification) {
    return "VALID";
  }
  return "CLARIFY";
}

function verifyFixtures(ast, fixtures = []) {
  if (fixtures.length === 0) return { checked: 0, failures: [] };
  if (!ast) {
    return {
      checked: 0,
      failures: [{ reason: "accepted/expected executable case returned no AST" }],
    };
  }
  const failures = [];
  for (const [index, fixture] of fixtures.entries()) {
    try {
      const actual = evaluatePredicate(ast, {
        draw: fixture.draw,
        guess: fixture.guess,
      }).result;
      if (actual !== fixture.outcome) {
        failures.push({ index, expected: fixture.outcome, actual });
      }
    } catch (error) {
      failures.push({ index, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  return { checked: fixtures.length, failures };
}

const baseUrl = process.argv[2] ?? "http://127.0.0.1:3002";
const compact = process.argv.includes("--compact");
const offline = process.argv.includes("--offline");
const onlyIds = new Set(
  process.argv
    .slice(3)
    .filter((argument) => argument !== "--compact" && argument !== "--offline"),
);
const selected = onlyIds.size > 0 ? cases.filter(({ id }) => onlyIds.has(id)) : cases;
const results = [];

function printResult(result, progress) {
  if (!compact || !result.pass) {
    console.log(JSON.stringify({ progress, ...result }));
    return;
  }
  console.log(
    JSON.stringify({
      progress,
      id: result.id,
      question: result.question,
      actual: result.actual,
      pass: result.pass,
      fixtureChecks: result.fixtureChecks,
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
    const actual = validation.log.reasonCodes.includes("EXTERNAL_DEPENDENCY")
      ? "BLOCK"
      : validation.decision === "VALID"
        ? "VALID"
        : "CLARIFY";
    const fixtureResult = verifyFixtures(validation.artifact?.ast ?? null, testCase.fixtures);
    const result = {
      id: testCase.id,
      question: testCase.question,
      actual,
      expected: testCase.expect,
      outcomePass: testCase.expect.includes(actual),
      fixtureChecks: fixtureResult.checked,
      fixtureFailures: fixtureResult.failures,
      pass: testCase.expect.includes(actual) && fixtureResult.failures.length === 0,
      latencyMs: 0,
      reasonCodes: validation.log.reasonCodes,
      officialInterpretation: validation.artifact?.officialInterpretation ?? null,
      ast: validation.artifact?.ast ?? null,
    };
    results.push(result);
    printResult(result, `${index + 1}/${selected.length}`);
  }
  const summary = {
    total: results.length,
    pass: results.filter((result) => result.pass).length,
    fail: results.filter((result) => !result.pass).length,
    fixtureChecks: results.reduce((sum, result) => sum + result.fixtureChecks, 0),
    fixtureFailures: results.reduce(
      (sum, result) => sum + result.fixtureFailures.length,
      0,
    ),
  };
  console.log(JSON.stringify({ summary }));
  process.exit(0);
}

for (const [index, testCase] of selected.entries()) {
  const startedAt = Date.now();
  let response;
  let payload;
  try {
    response = await fetch(`${baseUrl}/rule-preflight`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phase: "compile", text: testCase.text }),
      signal: AbortSignal.timeout(360_000),
    });
    payload = await response.json();
  } catch (error) {
    const result = {
      id: testCase.id,
      question: testCase.question,
      actual: "ERROR",
      expected: testCase.expect,
      pass: false,
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
    results.push(result);
    printResult(result, `${index + 1}/${selected.length}`);
    continue;
  }

  const preflight = payload?.preflight ?? null;
  const actual = classify(preflight, response.status);
  const fixtureResult = verifyFixtures(preflight?.ast ?? null, testCase.fixtures);
  const result = {
    id: testCase.id,
    question: testCase.question,
    actual,
    expected: testCase.expect,
    outcomePass: testCase.expect.includes(actual),
    fixtureChecks: fixtureResult.checked,
    fixtureFailures: fixtureResult.failures,
    pass: testCase.expect.includes(actual) && fixtureResult.failures.length === 0,
    latencyMs: Date.now() - startedAt,
    decision: preflight?.decision ?? null,
    needsClarification: preflight?.needsClarification ?? null,
    confirmationRequired: preflight?.confirmationRequired ?? null,
    reproposalBlocked: preflight?.reproposalBlocked ?? false,
    reasonSummary: preflight?.reasonSummary ?? payload?.message ?? payload?.error ?? null,
    refinementQuestions: preflight?.refinementQuestions ?? [],
    officialInterpretation: preflight?.officialInterpretation ?? null,
    ast: preflight?.ast ?? null,
    sourceSpans: preflight?.sourceSpans ?? null,
  };
  results.push(result);
  printResult(result, `${index + 1}/${selected.length}`);
}

const byQuestion = Object.fromEntries(
  Array.from({ length: 8 }, (_, index) => {
    const question = index + 1;
    const group = results.filter((result) => result.question === question);
    return [
      question,
      {
        pass: group.filter((result) => result.pass).length,
        fail: group.filter((result) => !result.pass).length,
      },
    ];
  }),
);
console.log(
  JSON.stringify({
    summary: {
      total: results.length,
      pass: results.filter((result) => result.pass).length,
      fail: results.filter((result) => !result.pass).length,
      fixtureChecks: results.reduce((sum, result) => sum + result.fixtureChecks, 0),
      fixtureFailures: results.reduce(
        (sum, result) => sum + result.fixtureFailures.length,
        0,
      ),
      byQuestion,
    },
  }),
);
