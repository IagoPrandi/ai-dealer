import { ruleAstSchema } from "@tyche/rule-compiler";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  assemble,
  CATALOG,
  constructSignatures,
  createJevDecider,
  createTelemetry,
  GAME_DOMAIN,
  integerMenu,
  scoreCandidate,
  TERMINATORS,
} from "./jev-ast-assembly.mjs";
import { benchmark } from "./jev-direct-rule-evaluation.mjs";
import { configuredValue, decide, openRouterKey } from "./jev-rule-probe.mjs";

// Read-only experiment. Jev is shown every construct of the schemaVersion 3
// grammar and asked, one Noul per construct, whether the rule needs it. The
// surviving set is then used two ways: Jev assembles hole by hole, or an LLM
// writes the whole tree from it. A third flow gives the LLM the full grammar
// with no Jev call, as the control. Reference ASTs stay hidden oracles.

const INCLUSION_THRESHOLD = 0.5;
const SIGNATURES = constructSignatures();

// ---------------------------------------------------------------------------
// The piece screen: one Noul per construct, batched by hole type.
// ---------------------------------------------------------------------------

async function screenPieces(proposal, telemetry) {
  const nouls = {};
  const selected = {};
  const calls = [];
  for (const [type, catalog] of Object.entries(CATALOG)) {
    const questions = Object.fromEntries(
      Object.entries(catalog).map(([kind, entry]) => [
        kind,
        {
          type: "noul",
          instructions: `Does a correct executable form of rule_proposal need this construct: ${entry.doc} Answer yes only when the rule cannot be expressed without it. Judge the whole rule, not one part of it.`,
        },
      ]),
    );
    const state = {
      game_context: GAME_DOMAIN,
      rule_proposal: proposal,
      screening_task: `A rule is compiled into an expression tree over the two lists. Every construct available for a ${type} position is listed below with the exact JSON it produces. Decide which of them the rule actually needs; the ones kept become the only options available later.`,
      constructs_available: SIGNATURES[type],
      other_positions: Object.fromEntries(
        Object.entries(SIGNATURES)
          .filter(([other]) => other !== type)
          .map(([other, entries]) => [
            other,
            Object.fromEntries(
              Object.entries(entries).map(([kind, entry]) => [kind, entry.doc]),
            ),
          ]),
      ),
    };
    const response = await decide(state, questions);
    telemetry.record(response);
    calls.push({ type, latencyMs: response.latencyMs });
    nouls[type] = Object.fromEntries(
      Object.keys(catalog).map((kind) => [
        kind,
        response.answers?.[kind]?.noul ?? null,
      ]),
    );
    selected[type] = new Set(
      Object.entries(nouls[type])
        .filter(([, value]) => value !== null && value >= INCLUSION_THRESHOLD)
        .map(([kind]) => kind),
    );
  }
  const guards = [];
  for (const [type, terminator] of Object.entries(TERMINATORS)) {
    if (!selected[type].has(terminator)) {
      selected[type].add(terminator);
      guards.push(
        `screen rejected the terminating construct \`${terminator}\` for ${type} (noul ${nouls[type][terminator]}); re-added so a tree can close`,
      );
    }
  }
  return { nouls, selected, guards, calls };
}

function selectionNarrower(selected, notes) {
  return (hole, kinds) => {
    const narrowed = kinds.filter((kind) => selected[hole.type].has(kind));
    if (narrowed.length === 0) {
      notes.push(
        `screen left no legal option at ${hole.path}; fell back to the full menu`,
      );
      return kinds;
    }
    return narrowed;
  };
}

// ---------------------------------------------------------------------------
// LLM tree writer. Constrained decoding against the recursive AST schema ran
// away to the token limit in a live probe, so this uses JSON mode plus zod
// validation and one repair attempt, and records which attempt succeeded.
// ---------------------------------------------------------------------------

const BUILD_INSTRUCTION = `You compile a player's natural-language winning rule into a Tyche schemaVersion 3 rule AST.

The rule is evaluated over exactly two arrays: \`guess\` (the player's six numbers) and \`draw\` (the six drawn numbers).

Return ONLY a JSON object of this exact shape and nothing else:
{"schemaVersion": 3, "result": <result>}

<result> is either
  {"type": "predicate", "predicate": <predicate>}
when each ticket wins or loses on its own, or
  {"type": "ranking", "eligibleWhen": <predicate>, "score": <scalar>, "direction": "max"|"min", "tieBreak": "share_pool"}
when tickets are scored and compared against each other. \`eligibleWhen\` is optional and only for a stated condition that excludes a ticket from the comparison.

Build <predicate>, <scalar> and <array> only from the constructs listed in allowedConstructs. Using any construct that is not listed is an error.

Scope rules: \`map\`, \`filter\`, \`forall\` and \`exists\` bind one element, referenced by {"kind":"elem"}; \`pairs_map\`, \`pairs_forall\` and \`pairs_exists\` bind one position pair, referenced by {"kind":"pair","side":"left"|"right"}. These binders may not nest more than two deep. \`at\` and \`slice\` need an array of statically known length, so they cannot read the output of \`filter\`, \`distinct\`, \`intersection\` or \`difference\`.

Express exactly what the proposal states. Do not add a condition the proposal does not state, and do not drop one it does.`;

async function writeAstWithLlm(proposal, allowed, integers, telemetry) {
  const model =
    configuredValue("LLM_MODEL_COMPILE", false) ??
    configuredValue("LLM_MODEL_INTERPRET", false) ??
    configuredValue("LLM_MODEL");
  const allowedConstructs = Object.fromEntries(
    Object.entries(SIGNATURES).map(([type, entries]) => [
      type,
      Object.fromEntries(
        Object.entries(entries).filter(([kind]) => allowed[type].has(kind)),
      ),
    ]),
  );
  const messages = [
    { role: "system", content: BUILD_INSTRUCTION },
    {
      role: "user",
      content: JSON.stringify({
        gameDomain: GAME_DOMAIN,
        allowedConstructs,
        numbersMentionedByTheProposal: integers,
        ruleProposal: proposal,
      }),
    },
  ];
  const attempts = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const started = performance.now();
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${openRouterKey()}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: "json_object" },
          max_tokens: 3000,
        }),
        signal: AbortSignal.timeout(180_000),
      },
    );
    const body = await response.json();
    const latencyMs = Math.round(performance.now() - started);
    telemetry.llmCalls += 1;
    telemetry.llmLatencyMs += latencyMs;
    telemetry.llmCostUsd += body.usage?.cost ?? 0;
    if (!response.ok) {
      attempts.push({
        attempt,
        error: `HTTP ${response.status}: ${JSON.stringify(body).slice(0, 200)}`,
        latencyMs,
      });
      break;
    }
    const content = body.choices?.[0]?.message?.content;
    const finish = body.choices?.[0]?.finish_reason ?? null;
    let candidate = null;
    let failure = null;
    try {
      const raw = JSON.parse(content);
      candidate = raw?.ast && !raw.result ? raw.ast : raw;
    } catch {
      failure = `malformed JSON (finish reason: ${finish})`;
    }
    if (candidate) {
      const parsed = ruleAstSchema.safeParse(candidate);
      if (parsed.success) {
        attempts.push({ attempt, latencyMs, finish, ok: true });
        return { ast: candidate, attempts, model: body.model ?? model };
      }
      failure = parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .slice(0, 8)
        .join("; ");
    }
    attempts.push({ attempt, latencyMs, finish, failure });
    if (attempt === 2) break;
    messages.push(
      { role: "assistant", content: String(content).slice(0, 4000) },
      {
        role: "user",
        content: `That output was rejected: ${failure}. Return the corrected JSON object only, using the same allowed constructs.`,
      },
    );
  }
  return { ast: null, attempts, model };
}

function constructsUsed(
  node,
  found = { array: new Set(), scalar: new Set(), predicate: new Set() },
) {
  if (!node || typeof node !== "object") return found;
  if (Array.isArray(node)) {
    for (const entry of node) constructsUsed(entry, found);
    return found;
  }
  if (typeof node.kind === "string") {
    for (const [type, catalog] of Object.entries(CATALOG)) {
      if (node.kind in catalog) found[type].add(node.kind);
    }
  }
  for (const value of Object.values(node)) constructsUsed(value, found);
  return found;
}

function violations(ast, allowed) {
  const used = constructsUsed(ast);
  const out = [];
  for (const type of Object.keys(CATALOG)) {
    for (const kind of used[type]) {
      if (!allowed[type].has(kind)) out.push(`${type}.${kind}`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Flows.
// ---------------------------------------------------------------------------

function baseRow(item, flow) {
  return {
    flow,
    ruleId: item.id,
    tier: item.tier,
    language: item.language,
    proposal: item.proposal,
  };
}

async function runJevScreen(item) {
  const telemetry = createTelemetry();
  const started = performance.now();
  const menus = { integers: integerMenu(item.proposal) };
  const screen = await screenPieces(item.proposal, telemetry);
  const notes = [...screen.guards];
  const assembled = await assemble(
    item.proposal,
    createJevDecider(item.proposal, null, telemetry),
    menus,
    selectionNarrower(screen.selected, notes),
  );
  return {
    ...baseRow(item, "jev-screen"),
    integerMenu: menus.integers,
    screenNouls: screen.nouls,
    selected: Object.fromEntries(
      Object.entries(screen.selected).map(([type, set]) => [type, [...set]]),
    ),
    notes,
    ...assembled,
    wallClockMs: Math.round(performance.now() - started),
    jev: {
      calls: telemetry.calls,
      screenCalls: screen.calls.length,
      summedLatencyMs: telemetry.latencyMs,
      costUsd: telemetry.costUsd,
      model: telemetry.model,
    },
    llm: null,
    score: assembled.ast ? scoreCandidate(item, assembled.ast) : null,
  };
}

async function runLlmBuild(item, useScreen) {
  const telemetry = createTelemetry();
  telemetry.llmCalls = 0;
  telemetry.llmLatencyMs = 0;
  telemetry.llmCostUsd = 0;
  const started = performance.now();
  const menus = { integers: integerMenu(item.proposal) };
  let screen = null;
  let allowed;
  if (useScreen) {
    screen = await screenPieces(item.proposal, telemetry);
    allowed = screen.selected;
  } else {
    allowed = Object.fromEntries(
      Object.entries(CATALOG).map(([type, catalog]) => [
        type,
        new Set(Object.keys(catalog)),
      ]),
    );
  }
  const built = await writeAstWithLlm(
    item.proposal,
    allowed,
    menus.integers,
    telemetry,
  );
  return {
    ...baseRow(item, useScreen ? "llm-build" : "llm-free"),
    integerMenu: menus.integers,
    screenNouls: screen?.nouls ?? null,
    selected: screen
      ? Object.fromEntries(
          Object.entries(screen.selected).map(([type, set]) => [
            type,
            [...set],
          ]),
        )
      : null,
    notes: screen?.guards ?? [],
    status: built.ast ? "COMPLETE" : "LLM_NO_VALID_AST",
    ast: built.ast,
    attempts: built.attempts,
    constructViolations: built.ast ? violations(built.ast, allowed) : [],
    steps: [],
    wallClockMs: Math.round(performance.now() - started),
    jev: {
      calls: telemetry.calls,
      screenCalls: screen?.calls.length ?? 0,
      summedLatencyMs: telemetry.latencyMs,
      costUsd: telemetry.costUsd,
      model: telemetry.model,
    },
    llm: {
      model: built.model,
      calls: telemetry.llmCalls,
      latencyMs: telemetry.llmLatencyMs,
      costUsd: telemetry.llmCostUsd,
    },
    score: built.ast ? scoreCandidate(item, built.ast) : null,
  };
}

const FLOWS = {
  "jev-screen": runJevScreen,
  "llm-build": (item) => runLlmBuild(item, true),
  "llm-free": (item) => runLlmBuild(item, false),
};

async function mapConcurrent(items, concurrency, fn) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      try {
        output[index] = await fn(items[index], index);
      } catch (error) {
        output[index] = {
          ruleId: items[index].id,
          tier: items[index].tier,
          status: `RUN_ERROR: ${error.message}`,
          steps: [],
          score: null,
        };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return output;
}

function summarize(runs) {
  const valid = runs.filter((run) => run.score?.schemaValid);
  return {
    rules: runs.length,
    completed: runs.filter((run) => run.status === "COMPLETE").length,
    schemaValid: valid.length,
    fixtureExact: valid.filter((run) => run.score.fixtureExact).length,
    behaviorallyEquivalent: valid.filter(
      (run) => run.score.behaviorallyEquivalent,
    ).length,
    structurallyIdentical: valid.filter(
      (run) => run.score.structurallyIdentical,
    ).length,
    meanRandomAgreement: valid.length
      ? valid.reduce((total, run) => total + run.score.randomAgreement, 0) /
        valid.length
      : null,
    constructViolations: runs.filter((run) => run.constructViolations?.length)
      .length,
    guardsFired: runs.filter((run) => run.notes?.length).length,
    jevCalls: runs.reduce((total, run) => total + (run.jev?.calls ?? 0), 0),
    jevCostUsd: runs.reduce((total, run) => total + (run.jev?.costUsd ?? 0), 0),
    llmCalls: runs.reduce((total, run) => total + (run.llm?.calls ?? 0), 0),
    llmCostUsd: runs.reduce((total, run) => total + (run.llm?.costUsd ?? 0), 0),
    summedJevLatencyMs: runs.reduce(
      (total, run) => total + (run.jev?.summedLatencyMs ?? 0),
      0,
    ),
    summedLlmLatencyMs: runs.reduce(
      (total, run) => total + (run.llm?.latencyMs ?? 0),
      0,
    ),
    byTier: Object.fromEntries(
      ["simple", "medium", "complex"].map((tier) => {
        const tierRuns = runs.filter((run) => run.tier === tier);
        return [
          tier,
          `${tierRuns.filter((run) => run.score?.behaviorallyEquivalent).length}/${tierRuns.length}`,
        ];
      }),
    ),
  };
}

function compactRow(run) {
  return {
    rule: run.ruleId,
    tier: run.tier,
    status: run.status === "COMPLETE" ? "complete" : run.status?.slice(0, 26),
    schema: run.score ? (run.score.schemaValid ? "valid" : "invalid") : "-",
    fixtures: run.score?.schemaValid
      ? `${run.score.fixtureMatches}/${run.score.fixtureTotal}`
      : "-",
    random: run.score?.schemaValid
      ? `${(run.score.randomAgreement * 100).toFixed(1)}%`
      : "-",
    equivalent: run.score?.behaviorallyEquivalent ? "yes" : "no",
    offMenu: run.constructViolations?.length
      ? run.constructViolations.join(",")
      : "",
  };
}

async function main() {
  const flag = (name, fallback) => {
    const found = process.argv.find((arg) => arg.startsWith(`--${name}=`));
    return found ? found.slice(name.length + 3) : fallback;
  };
  const ids = flag("ids", null);
  const selected = ids
    ? benchmark.filter((item) => ids.split(",").includes(item.id))
    : benchmark;
  if (selected.length === 0) throw new Error("no benchmark rule matched --ids");
  const wanted = flag("flow", "all");
  const names = wanted === "all" ? Object.keys(FLOWS) : wanted.split(",");
  const concurrency = Number(flag("concurrency", "4"));
  const output = flag("output", null);
  const wallStarted = performance.now();
  const report = {
    generatedAt: new Date().toISOString(),
    method: {
      jevModel: "~typesafe/jev-latest",
      inclusionThreshold: INCLUSION_THRESHOLD,
      screen:
        "one Noul per construct, batched by hole type; terminating constructs are re-added when rejected",
      llmDecoding:
        "JSON mode plus zod validation and one repair attempt; constrained decoding against the recursive AST schema overran the token limit in a live probe",
      note: "Reference ASTs are hidden oracles used only to score finished candidates.",
    },
    flows: {},
  };
  for (const name of names) {
    if (!FLOWS[name]) throw new Error(`unknown flow ${name}`);
    const runs = await mapConcurrent(selected, concurrency, FLOWS[name]);
    report.flows[name] = { summary: summarize(runs), runs };
    console.log(`\n${name}`);
    console.table(runs.map(compactRow));
  }
  report.endToEndWallClockMs = Math.round(performance.now() - wallStarted);
  if (output)
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(
    JSON.stringify(
      Object.fromEntries(
        Object.entries(report.flows).map(([name, value]) => [
          name,
          value.summary,
        ]),
      ),
      null,
      2,
    ),
  );
}

export { screenPieces, selectionNarrower, writeAstWithLlm };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
