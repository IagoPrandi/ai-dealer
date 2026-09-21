import { writeFileSync } from "node:fs";
import { buildCorpus } from "../src/jevCorpus.js";

/**
 * Builds the blind benchmark corpus and writes it out. The build validates every
 * label against the deterministic oracle and throws rather than emitting a
 * corpus whose gates would pass for the wrong reason.
 *
 * Usage: node --import tsx scripts/jev-build-corpus.mts [output.json]
 */
const output = process.argv[2] ?? "docs/jev-benchmark-corpus.json";
const { proposals, stats } = buildCorpus();
writeFileSync(
  output,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), proposals, stats }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
process.stdout.write(`Wrote ${proposals.length} proposals to ${output}\n`);
