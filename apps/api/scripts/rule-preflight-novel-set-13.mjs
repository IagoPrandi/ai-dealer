// Test set 13 - four rules whose composition appears nowhere in sets 1-12, plus
// two deliberately imprecise rules of classes no earlier set used.
// Same method as sets 7-12, so the numbers stay comparable: the two-phase player
// flow (`interpret` -> approve -> `compile`), a reference AST proved against
// boundary fixtures BEFORE the agent is judged, and every accepted or discarded
// AST executed against fixtures written from the ORIGINAL prompt. Agent prose is
// never the oracle.
//
// Capability axes chosen from a census of every reference AST in sets 5-12:
// `eligibleWhen`, `not`, `reverse` and `pairs_exists` appear in NONE of them.
//   N1  ELIGIBILITY-GATED ranking: the first use of `eligibleWhen` in any set -
//       a qualification clause (`count(intersection) >= 2`) separate from the
//       score (`range_span`), so an ineligible ticket with the best score must
//       not win. Sets 5-12 ranked the whole field.
//   N2  EXCLUSIVE disjunction: "exactly one of the two, not both", which needs
//       `or(and(A, not B), and(not A, B))`. No earlier set used `not` at all,
//       and the obvious misreading (plain `or`) differs on exactly one fixture.
//       The second clause also tests `contains` of a DERIVED scalar (the
//       guess's maximum) rather than of a bound element.
//   N3  TWO DERIVED SUBSETS OF THE SAME SIDE cross-quantified: the hits
//       (`intersection`) against the misses (`difference`) of the guess, with a
//       per-element units digit computed as `mod 10` at both binder levels.
//       Sets 10/11 took a difference against a source; none split one side into
//       two complementary subsets and then related them to each other.
//   N4  MIRROR pairing with `reverse` + `pairs_exists`: the guess in entry
//       order against the draw read backwards. Set 10 N3 zipped guess ASC
//       against draw DESC (both sorted); this rule is about the order the
//       player wrote, so a perfect ticket in ascending order LOSES.
//
// Imprecise pair (clarification loop), both classes new to this set:
//   V1  GROUPING / PRECEDENCE ambiguity with NO undefined term: every quantity
//       ("highest", "lowest", "how many were drawn", "forty") is objective and
//       the sentence still has two arithmetic readings. Every earlier vague
//       prompt hid an undefined magnitude, referent, or criterion.
//   V2  UNDEFINED STATISTICAL REFERENT: "the middle of the draw" (mean, median
//       or midpoint of its range), "the far side" (which direction), and "half
//       your numbers" (exactly three or at least three).
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

const hits = { kind: "intersection", left: src("guess"), right: src("draw") };
const misses = { kind: "difference", left: src("guess"), right: src("draw") };
const unitsOf = (node) => ar("mod", node, lit(10));

// N2 - the two independent claims the exclusive disjunction ranges over
const sumBeatsDraw = cmp(
  "gt",
  red("sum", src("guess")),
  red("sum", src("draw")),
);
const highestWasDrawn = {
  kind: "contains",
  array: src("draw"),
  value: red("max", src("guess")),
};
const exactlyOneOf = (a, b) => ({
  kind: "or",
  clauses: [
    { kind: "and", clauses: [a, { kind: "not", clause: b }] },
    { kind: "and", clauses: [{ kind: "not", clause: a }, b] },
  ],
});

const referenceAsts = {
  "N1-eligible-then-tightest-span": {
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "min",
      tieBreak: "share_pool",
      eligibleWhen: cmp("gte", red("count", hits), lit(2)),
      score: red("range_span", src("guess")),
    },
  },
  "N2-exactly-one-of-two": predicate(
    exactlyOneOf(sumBeatsDraw, highestWasDrawn),
  ),
  "N3-miss-shares-digit-with-hit": predicate({
    kind: "exists",
    of: misses,
    where: {
      kind: "exists",
      of: hits,
      where: cmp("eq", unitsOf(elem), unitsOf(outerElem)),
    },
  }),
  "N4-mirror-position-match": predicate({
    kind: "pairs_exists",
    left: src("guess"),
    right: { kind: "reverse", of: src("draw") },
    where: cmp(
      "eq",
      { kind: "pair", side: "left" },
      { kind: "pair", side: "right" },
    ),
  }),
};

const cases = [
  {
    id: "N1-eligible-then-tightest-span",
    kind: "ranking",
    expect: ["VALID"],
    text: "Only tickets that match at least two of the drawn numbers are in the running. Among those, the ticket whose six numbers are packed into the smallest range between its lowest and its highest number wins, and tickets level on that range share the prize equally.",
    rankingFixtures: [
      {
        note: "the tightest of two qualifying tickets wins",
        draw: DRAW,
        entries: { A: [10, 20, 21, 22, 23, 24], B: [10, 20, 30, 40, 50, 60] },
        winners: ["A"],
      },
      {
        note: "eligibility gate: a tighter ticket with no matches does not win",
        draw: DRAW,
        entries: { C: [1, 2, 3, 4, 5, 6], D: [10, 20, 45, 46, 47, 48] },
        winners: ["D"],
      },
      {
        note: "boundary: exactly two matches qualifies, one match does not",
        draw: DRAW,
        entries: { E: [10, 20, 90, 91, 92, 93], F: [10, 11, 12, 13, 14, 15] },
        winners: ["E"],
      },
      {
        note: "two qualifying tickets level on span share the prize",
        draw: DRAW,
        entries: { G: [10, 20, 31, 32, 33, 34], H: [40, 50, 61, 62, 63, 64] },
        winners: ["G", "H"],
      },
      {
        note: "entry order is irrelevant: the same multiset still wins",
        draw: DRAW,
        entries: { A: [24, 10, 23, 20, 22, 21], B: [60, 50, 40, 30, 20, 10] },
        winners: ["A"],
      },
      {
        note: "discriminator: the smallest span wins, not the most matches",
        draw: DRAW,
        entries: { I: [10, 20, 30, 40, 50, 60], J: [10, 20, 21, 22, 23, 24] },
        winners: ["J"],
      },
      {
        note: "no ticket qualifies, so nobody wins",
        draw: DRAW,
        entries: { X: [1, 2, 3, 4, 5, 7], Y: [71, 72, 73, 74, 75, 76] },
        winners: [],
      },
      {
        note: "draw sensitivity: the tight ticket qualifies once the draw moves onto it",
        draw: [1, 2, 55, 66, 77, 88],
        entries: { C: [1, 2, 3, 4, 5, 6], D: [10, 20, 45, 46, 47, 48] },
        winners: ["C"],
      },
    ],
  },
  {
    id: "N2-exactly-one-of-two",
    kind: "predicate",
    expect: ["VALID"],
    text: "You win if exactly one of these two statements is true, and you lose if both are true or neither is: your six numbers add up to more than the six drawn numbers add up to, or your highest number was drawn.",
    fixtures: [
      {
        note: "only the sum statement holds",
        guess: [11, 21, 31, 41, 51, 62],
        draw: DRAW,
        outcome: "WIN",
      },
      {
        note: "only the highest-number statement holds",
        guess: [1, 2, 3, 4, 5, 60],
        draw: DRAW,
        outcome: "WIN",
      },
      {
        note: "discriminator against plain OR: both statements hold",
        guess: [20, 30, 40, 50, 60, 11],
        draw: DRAW,
        outcome: "LOSE",
      },
      {
        note: "neither statement holds",
        guess: [1, 2, 3, 4, 5, 6],
        draw: DRAW,
        outcome: "LOSE",
      },
      {
        note: "boundary: an equal sum is not more, and the highest was not drawn",
        guess: [35, 36, 37, 38, 39, 25],
        draw: DRAW,
        outcome: "LOSE",
      },
      {
        note: "boundary: an equal sum is not more, but the highest was drawn",
        guess: [30, 31, 32, 33, 34, 50],
        draw: DRAW,
        outcome: "WIN",
      },
      {
        note: "entry order is irrelevant: both-true scrambled still loses",
        guess: [11, 60, 20, 50, 30, 40],
        draw: DRAW,
        outcome: "LOSE",
      },
      {
        note: "draw sensitivity: the same guess loses once 60 is not drawn",
        guess: [1, 2, 3, 4, 5, 60],
        draw: [10, 20, 30, 40, 50, 55],
        outcome: "LOSE",
      },
    ],
  },
  {
    id: "N3-miss-shares-digit-with-hit",
    kind: "predicate",
    expect: ["VALID"],
    text: "Split your six numbers into the ones that were drawn and the ones that were not. You win if at least one of the numbers you missed ends in the same last digit as one of the numbers you got right.",
    fixtures: [
      {
        note: "the missed 70 ends in the same digit as the hit 10",
        guess: [10, 70, 1, 2, 3, 4],
        draw: DRAW,
        outcome: "WIN",
      },
      {
        note: "one hit, but no miss shares its last digit",
        guess: [10, 71, 72, 73, 74, 75],
        draw: DRAW,
        outcome: "LOSE",
      },
      {
        note: "boundary: no hits at all, so no pair can exist",
        guess: [1, 2, 3, 4, 5, 6],
        draw: DRAW,
        outcome: "LOSE",
      },
      {
        note: "boundary: a perfect ticket has no misses, so no pair can exist",
        guess: [10, 20, 30, 40, 50, 60],
        draw: DRAW,
        outcome: "LOSE",
      },
      {
        note: "entry order is irrelevant",
        guess: [4, 70, 3, 10, 2, 1],
        draw: DRAW,
        outcome: "WIN",
      },
      {
        note: "the pair may be any hit and any miss",
        guess: [20, 100, 11, 12, 13, 14],
        draw: DRAW,
        outcome: "WIN",
      },
      {
        note: "discriminator: sharing a digit with a DRAWN number you missed does not count",
        guess: [1, 2, 3, 4, 5, 70],
        draw: DRAW,
        outcome: "LOSE",
      },
      {
        note: "draw sensitivity: the winning guess loses once the hits change",
        guess: [10, 70, 1, 2, 3, 4],
        draw: [1, 2, 3, 4, 5, 6],
        outcome: "LOSE",
      },
    ],
  },
  {
    id: "N4-mirror-position-match",
    kind: "predicate",
    expect: ["VALID"],
    text: "Line your six numbers up against the drawn numbers in mirror order: your first number against the last drawn number, your second against the fifth drawn, and so on to your sixth against the first drawn. You win if at least one of those mirrored pairs holds the same number on both sides.",
    fixtures: [
      {
        note: "the first number written matches the last drawn",
        guess: [60, 1, 2, 3, 4, 5],
        draw: DRAW,
        outcome: "WIN",
      },
      {
        note: "discriminator: a perfect ticket in drawn order has no mirrored match",
        guess: [10, 20, 30, 40, 50, 60],
        draw: DRAW,
        outcome: "LOSE",
      },
      {
        note: "discriminator: a same-position match is not a mirrored match",
        guess: [10, 1, 2, 3, 4, 5],
        draw: DRAW,
        outcome: "LOSE",
      },
      {
        note: "the third pair matches",
        guess: [1, 2, 40, 3, 4, 5],
        draw: DRAW,
        outcome: "WIN",
      },
      {
        note: "order matters here: the same six numbers written the other way round lose",
        guess: [1, 2, 3, 4, 5, 60],
        draw: DRAW,
        outcome: "LOSE",
      },
      {
        note: "the sixth number written matches the first drawn",
        guess: [1, 2, 3, 4, 5, 10],
        draw: DRAW,
        outcome: "WIN",
      },
      {
        note: "two mirrored pairs match",
        guess: [60, 50, 1, 2, 3, 4],
        draw: DRAW,
        outcome: "WIN",
      },
      {
        note: "draw sensitivity: the same ticket loses once the draw order changes",
        guess: [60, 1, 2, 3, 4, 5],
        draw: [60, 20, 30, 40, 50, 10],
        outcome: "LOSE",
      },
    ],
  },
  {
    id: "V1-vague-grouping",
    kind: "vague",
    expect: ["CLARIFY"],
    text: "You win if your highest number minus your lowest plus how many of your numbers were drawn is more than forty.",
  },
  {
    id: "V2-vague-middle-of-draw",
    kind: "vague",
    expect: ["CLARIFY"],
    text: "You win if half your numbers land on the far side of the middle of the draw.",
  },
];

// Round 2 is filled in after round 1, from the questions the agent asked.
// `--round2` reads it from scripts/set-13-round2.json so the round-1 evidence
// is what drives it, not a text written in advance.
function loadRound2() {
  const raw = JSON.parse(
    readFileSync(new URL("./set-13-round2.json", import.meta.url), "utf8"),
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
function classify(preflight, status) {
  if (status !== 200 || !preflight) return "BLOCK";
  if (preflight.reproposalBlocked) return "REPROPOSAL_BLOCKED";
  if (preflight.decision === "VALID" && !preflight.needsClarification)
    return "VALID";
  if (preflight.decision === "VALID" && preflight.needsClarification)
    return "CLARIFY";
  return preflight.refinementQuestions?.length > 0 ? "CLARIFY" : "REFUSED";
}

function verifyPredicateFixtures(ast, fixtures = []) {
  if (fixtures.length === 0) return { checked: 0, failures: [] };
  if (!ast)
    return {
      checked: 0,
      failures: [{ reason: "accepted case returned no AST" }],
    };
  const failures = [];
  for (const fixture of fixtures) {
    try {
      const actual = evaluatePredicate(ast, {
        draw: fixture.draw,
        guess: fixture.guess,
      }).result;
      if (actual !== fixture.outcome) {
        failures.push({
          note: fixture.note,
          expected: fixture.outcome,
          actual,
        });
      }
    } catch (error) {
      failures.push({
        note: fixture.note,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { checked: fixtures.length, failures };
}

function verifyRankingFixtures(ast, fixtures = []) {
  if (fixtures.length === 0) return { checked: 0, failures: [] };
  if (!ast)
    return {
      checked: 0,
      failures: [{ reason: "accepted case returned no AST" }],
    };
  const direction = ast.result?.direction ?? "max";
  const failures = [];
  for (const fixture of fixtures) {
    try {
      const scored = Object.entries(fixture.entries).map(([player, guess]) => {
        const evaluation = evaluateRankingEntry(ast, {
          draw: fixture.draw,
          guess,
        });
        return {
          player,
          eligible: evaluation.eligible,
          score: evaluation.score,
        };
      });
      const winners = [...resolveRankingWinners(scored, direction)].sort();
      const expected = [...fixture.winners].sort();
      if (JSON.stringify(winners) !== JSON.stringify(expected)) {
        failures.push({
          note: fixture.note,
          expected,
          actual: winners,
          scored,
        });
      }
    } catch (error) {
      failures.push({
        note: fixture.note,
        reason: error instanceof Error ? error.message : String(error),
      });
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
    const settle = (result) =>
      resolve({ stages, ms: Date.now() - startedAt, ...result });
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
          settle({
            status,
            terminal,
            transportError: status >= 400 ? body : null,
          }),
        );
        response.on("error", (error) =>
          settle({
            status,
            terminal,
            transportError: `stream aborted: ${error.message}`,
          }),
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
const winrate = process.argv.includes("--winrate");
const round2 = process.argv.includes("--round2");
const onlyIds = new Set(
  process.argv.slice(3).filter((argument) => !argument.startsWith("--")),
);
const corpus = round2 ? loadRound2() : cases;
const selected =
  onlyIds.size > 0 ? corpus.filter(({ id }) => onlyIds.has(id)) : corpus;
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
  const corpusById = new Map(
    [...cases, ...(round2 ? loadRound2() : [])].map((c) => [c.id, c]),
  );
  const ndjsonLines = readFileSync(file, "utf8")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
  for (const line of ndjsonLines) {
    const record = JSON.parse(line);
    if (record.summary) continue;
    const testCase = corpusById.get(record.id);
    if (!testCase || testCase.kind === "vague") continue;
    for (const [index, attempt] of (
      record.rejectedCompilerAttempts ?? []
    ).entries()) {
      const ast = attempt.candidate?.ast ?? null;
      if (!ast) continue;
      const parsed = ruleAstSchema.safeParse(ast);
      const fixtureResult = verifyFixtures(
        testCase,
        parsed.success ? ast : null,
      );
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
            .map((stage) => ({
              stage: stage.stage,
              detail: (stage.detail ?? "").slice(0, 300),
            })),
        }),
      );
    }
  }
} else if (winrate) {
  // Sanity check on the difficulty gate: a rule the gate would legitimately
  // refuse as impossible or always-true is a bad probe of the agent, so the
  // reference reading's rate is measured before the corpus is used at all.
  const SAMPLES = 20000;
  let seed = 0x5eed1301;
  const next = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ticket = () => {
    const picked = new Set();
    while (picked.size < 6) picked.add(1 + Math.floor(next() * 100));
    return [...picked];
  };
  for (const testCase of selected) {
    const ast = referenceAsts[testCase.id];
    if (!ast || testCase.kind === "vague") continue;
    let hit = 0;
    for (let index = 0; index < SAMPLES; index += 1) {
      const draw = ticket();
      const guess = ticket();
      if (testCase.kind === "ranking") {
        if (evaluateRankingEntry(ast, { draw, guess }).eligible) hit += 1;
      } else if (evaluatePredicate(ast, { draw, guess }).result === "WIN") {
        hit += 1;
      }
    }
    console.log(
      JSON.stringify({
        id: testCase.id,
        metric: testCase.kind === "ranking" ? "eligibleRate" : "winRate",
        rate: hit / SAMPLES,
        samples: SAMPLES,
      }),
    );
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
      pass:
        testCase.expect.includes(actual) && fixtureResult.failures.length === 0,
      reasonCodes: validation.log.reasonCodes,
      officialInterpretation:
        validation.artifact?.officialInterpretation ?? null,
      latencyMs: 0,
      ast,
    };
    results.push(result);
    printResult(result, `${index + 1}/${selected.length}`);
  }
} else {
  for (const [index, testCase] of selected.entries()) {
    const text = testCase.text;
    const interpret = await callPreflight(baseUrl, {
      phase: "interpret",
      text,
    });
    const interpretation = interpret.terminal?.interpretation ?? null;
    const approvable =
      Boolean(interpretation) && interpretation.needsClarification === false;
    const compile = approvable
      ? await callPreflight(baseUrl, {
          phase: "compile",
          text,
          approvedInterpretation: toApprovedInterpretation(interpretation),
        })
      : null;
    const preflight = compile?.terminal?.preflight ?? null;
    // Only a real dealer clarification is CLARIFY. A failed interpret call has
    // no approved intent and must not be disguised by the compile endpoint's
    // expected missing-approval 400 response.
    const actual =
      interpretation?.needsClarification === true
        ? "CLARIFY"
        : interpretation === null
          ? "BLOCK"
          : classify(preflight, compile?.status ?? 0);
    const fixtureResult = verifyFixtures(testCase, preflight?.ast ?? null);
    const result = {
      id: testCase.id,
      text,
      actual,
      expected: testCase.expect,
      fixtureChecks: fixtureResult.checked,
      fixtureFailures: fixtureResult.failures,
      pass:
        testCase.expect.includes(actual) && fixtureResult.failures.length === 0,
      approvedInterpretationSent: approvable,
      interpretNeedsClarification: interpretation?.needsClarification ?? null,
      // Recorded because this is the text the compiler re-screens for external
      // dependencies and ambiguity: a paraphrase can carry a violation the
      // player's own wording never had (set-11 D3).
      interpretNormalizedText: interpretation?.normalizedText ?? null,
      interpretAddedOperationalClauses:
        interpretation?.addedOperationalClauses ?? [],
      interpretClarificationQuestions:
        interpretation?.clarificationQuestions ?? [],
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
      generationRetryable: preflight?.generationRetryable ?? null,
      difficultyClass: preflight?.difficultyClass ?? null,
      reasonCodes: preflight?.reasonCodes ?? null,
      reasonSummary:
        preflight?.reasonSummary ??
        interpret.transportError ??
        compile?.transportError ??
        null,
      compileOfficialInterpretation: preflight?.officialInterpretation ?? null,
      coverage: preflight?.coverage ?? null,
      refinementQuestions: preflight?.refinementQuestions ?? [],
      suggestedRewrites: preflight?.suggestedRewrites ?? [],
      rejectedCompilerAttempts: preflight?.rejectedCompilerAttempts ?? [],
      interpretStages: interpret.stages,
      compileStages: compile?.stages ?? [],
      latencyMs: interpret.ms + (compile?.ms ?? 0),
      ast: preflight?.ast ?? null,
    };
    results.push(result);
    printResult(result, `${index + 1}/${selected.length}`);
  }
}

if (!refsOnly && !winrate) {
  console.log(
    JSON.stringify({
      summary: {
        total: results.length,
        pass: results.filter((result) => result.pass).length,
        fail: results.filter((result) => !result.pass).length,
        withAst: results.filter((result) => result.ast).length,
        fixtureChecks: results.reduce(
          (sum, result) => sum + result.fixtureChecks,
          0,
        ),
        fixtureFailures: results.reduce(
          (sum, result) => sum + result.fixtureFailures.length,
          0,
        ),
      },
    }),
  );
}
