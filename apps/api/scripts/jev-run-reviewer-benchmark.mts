import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  collectSemanticReviewFacets,
  describeRuleAstTotal,
  type RuleAst,
} from "@tyche/rule-compiler";
import { buildCorpus, type CorpusProposal } from "../src/jevCorpus.js";
import { resolveJevReviewConfig, reviewRuleAstWithJev } from "../src/jev.js";
import {
  summarizeJevReviewerHoldout,
  type JevReviewerJudgment,
} from "../src/jevMetrics.js";

/**
 * Offline phase 1 of the rollout in docs/jev-guarded-rollout.md.
 *
 * It judges every corpus candidate three times with the real typed reviewer and
 * writes the raw judgments plus the report. It measures the REVIEWER, not the
 * pipeline: the cost, response-time, question and final-artifact gates need the
 * full preflight run twice and stay unmeasured here. The report names them.
 *
 * This makes paid provider requests. It never submits, freezes, or activates a
 * rule, and the reference ASTs are local oracles the reviewer never sees.
 *
 * Usage:
 *   node --import tsx scripts/jev-run-reviewer-benchmark.mts [--limit N] [--concurrency N] [--out prefix]
 */

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const limit = Number(flag("limit") ?? Number.POSITIVE_INFINITY);
const concurrency = Math.max(1, Number(flag("concurrency") ?? 8));
const outPrefix = flag("out") ?? "docs/jev-reviewer-benchmark";
const REPETITIONS = [1, 2, 3] as const;

// Shadow scores every cohort with the configured thresholds. In gated or active
// an uncalibrated cohort abstains by design, which would measure the guard
// rather than the reviewer.
const config = { ...resolveJevReviewConfig(), mode: "shadow" as const };
if (!config.apiKey) {
  throw new Error(
    "No API key. Set JEV_API_KEY or API_KEY_OPENROUTER before running the benchmark.",
  );
}

interface Job {
  candidateId: string;
  correct: boolean;
  label: string;
  proposal: CorpusProposal;
  repetition: (typeof REPETITIONS)[number];
  /** The tree under review. */
  ast: RuleAst;
  /** The tree the description is rendered from; differs for serializer defects. */
  describeFrom: RuleAst;
}

const { proposals, stats } = buildCorpus();
const executable = proposals
  .filter((proposal) => proposal.kind === "executable")
  .slice(0, limit);

const jobs: Job[] = [];
for (const proposal of executable) {
  for (const candidate of proposal.candidates) {
    for (const repetition of REPETITIONS) {
      jobs.push({
        ast: candidate.ast,
        candidateId: candidate.candidateId,
        correct: candidate.correct,
        describeFrom: candidate.describeFromAst ?? candidate.ast,
        label: candidate.label,
        proposal,
        repetition,
      });
    }
  }
}

process.stderr.write(
  `Corpus: ${stats.executable} executable proposals, ${stats.correctCandidates} correct and ${stats.incorrectCandidates} incorrect candidates.\n` +
    `Running ${jobs.length} judgments at concurrency ${concurrency}.\n`,
);

async function judge(job: Job): Promise<JevReviewerJudgment> {
  const reference = job.proposal.referenceAst;
  if (!reference) throw new Error(`${job.proposal.id} has no reference AST`);
  const review = await reviewRuleAstWithJev(
    {
      ast: job.ast,
      // The compiler's own description of the candidate, exactly as production
      // sends it — except for serializer defects, where the stale reference
      // description is the defect under test.
      astDescription: describeRuleAstTotal(job.describeFrom),
      candidateArtifactHash: createHash("sha256")
        .update(JSON.stringify([job.proposal.id, job.candidateId]))
        .digest("hex"),
      facets: collectSemanticReviewFacets(job.ast),
      normalizedText: job.proposal.text,
      // The reading the player approved is the reference rule, stated in the
      // compiler's own words. The reviewer never sees the reference tree.
      officialInterpretation: describeRuleAstTotal(reference),
      originalText: job.proposal.text,
    },
    config,
  );
  return {
    candidateId: job.candidateId,
    complexity: job.proposal.complexity,
    correct: job.correct,
    costUsd: review.costUsd,
    label: job.label,
    language: job.proposal.language,
    latencyMs: review.latencyMs,
    proposalId: job.proposal.id,
    repetition: job.repetition,
    split: job.proposal.split,
    status: review.status,
  };
}

async function mapConcurrent<T, R>(
  items: readonly T[],
  workers: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.min(workers, items.length) }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        const item = items[index];
        if (item === undefined) return;
        results[index] = await run(item, index);
        done += 1;
        if (done % 100 === 0) {
          process.stderr.write(`  ${done}/${items.length}\n`);
        }
      }
    }),
  );
  return results;
}

const startedAt = Date.now();
const judgments = await mapConcurrent(jobs, concurrency, judge);
const wallClockMs = Date.now() - startedAt;
const report = summarizeJevReviewerHoldout(judgments);

writeFileSync(
  `${outPrefix}-judgments.json`,
  `${JSON.stringify(judgments, null, 2)}\n`,
  "utf8",
);
writeFileSync(
  `${outPrefix}-report.json`,
  `${JSON.stringify(
    {
      corpus: stats,
      generatedAt: new Date().toISOString(),
      model: config.model,
      report,
      thresholds: {
        astCoverage: config.astCoverageThreshold,
        facet: config.facetThreshold,
        sourceSupport: config.sourceSupportThreshold,
        structuralConfidence: config.structuralConfidenceThreshold,
        structuralProbability: config.structuralProbabilityThreshold,
      },
      wallClockMs,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(
  `\nWall clock ${(wallClockMs / 1000).toFixed(1)}s. Gates not measured here: ${report.gatesNotMeasured.join(", ")}.\n`,
);
if (!report.measuredGatesPassed) process.exitCode = 1;
