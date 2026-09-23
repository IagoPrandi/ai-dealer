// J12 artifact-check evaluation: the J11 production check state ("old") vs the
// J12 state ("new": description vocabulary, context-claim consistency) on the
// corpora's correct and wrong (one-change mutation) candidate ASTs. Each item
// gets one freshly verified claim ledger shared by both variants, so only the
// check differs. Read-only apart from the output file.
//
//   node --import tsx scripts/jev-artifact-check-evaluation.mts --repeats=2 --out=../../docs/<file>.json
process.loadEnvFile("../../.env");
import { writeFileSync } from "node:fs";

const { adversarialItems, freshItems, heldOutItems, v1Items } = await import("./jev-pipeline-items.mjs");
const { buildVerifiedClaimLedger } = await import("../src/ruleClaimLedger.js");
const { requestJevJudgment } = await import("../src/jev.js");
const sc = await import("../src/ruleSemanticChecks.js");
const { getDealerRuntime } = await import("../src/lifespan.js");
const rc = await import("@tyche/rule-compiler");

const repeats = Number(process.argv.find((a) => a.startsWith("--repeats="))?.slice(10) ?? 2);
const out = process.argv.find((a) => a.startsWith("--out="))?.slice(6) ?? "../../output/jev-artifact-check-evaluation.json";
const runtime = getDealerRuntime();
const random = rc.seededRandomScenarios();
const items = [...v1Items(), ...(await heldOutItems()), ...freshItems(), ...adversarialItems()].filter((i) => i.class === "CLEAR" && i.candidates.length > 0);

async function pool<T>(tasks: (() => Promise<T>)[], size: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < tasks.length) { const i = next++; results[i] = await tasks[i]!(); }
  }));
  return results;
}

const ledgers = await pool(items.map((item) => async () => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const run = await buildVerifiedClaimLedger({ jevConfig: runtime.jev, ledgerConfig: { ...runtime.compiler, seed: runtime.compiler.seed + 10 * attempt }, source: item.source });
    if (run.judgment.decision === "LEDGER_VERIFIED" && run.ledger) return run.ledger;
  }
  return null;
}), 4);

type Row = { id: string; candidate: string; correct: boolean; variant: "old" | "new"; repeat: number; decision: string; low: string[] };
const tasks: (() => Promise<Row | null>)[] = [];
items.forEach((item, index) => {
  const ledger = ledgers[index];
  if (!ledger) return;
  const library = rc.buildEvidenceLibrary(item.source);
  for (const candidate of item.candidates) {
    const evidence = rc.boundaryEvidence(candidate.ast, library, random);
    if (evidence.degenerate) continue;
    const base = sc.buildPublicCandidateState(ledger, candidate.ast, evidence.scenarios);
    const oldState = { ...base, candidate: { ...base.candidate, behaviorDescription: sc.describeWithStructure(candidate.ast) } };
    const variants = {
      new: sc.buildArtifactCheck(ledger, candidate.ast, evidence.scenarios),
      old: { questions: sc.buildCandidateQuestions(oldState), state: oldState },
    };
    for (let repeat = 1; repeat <= repeats; repeat += 1) {
      for (const variant of ["old", "new"] as const) {
        tasks.push(async () => {
          const { questions, state } = variants[variant];
          try {
            const response = await requestJevJudgment({ config: runtime.jev, questions, state, step: "semantic_check" });
            const judgment = sc.deriveCandidateJudgment(questions, response);
            return { candidate: candidate.id, correct: candidate.isCorrect, decision: judgment.decision, id: item.id, low: [...judgment.negative, ...judgment.uncertain], repeat, variant };
          } catch (error) {
            return { candidate: candidate.id, correct: candidate.isCorrect, decision: `error:${(error as Error).message}`, id: item.id, low: [], repeat, variant };
          }
        });
      }
    }
  }
});
const rows = (await pool(tasks, 6)).filter((row): row is Row => row !== null);
const summary: Record<string, Record<string, number>> = {};
for (const row of rows) {
  const key = `${row.variant}:${row.correct ? "correct" : "wrong"}`;
  summary[key] ??= {};
  summary[key]![row.decision] = (summary[key]![row.decision] ?? 0) + 1;
}
writeFileSync(out, JSON.stringify({ ledgersVerified: ledgers.filter(Boolean).length, items: items.length, rows, summary }, null, 2));
console.log(JSON.stringify({ ledgersVerified: ledgers.filter(Boolean).length, items: items.length, summary }, null, 2));
