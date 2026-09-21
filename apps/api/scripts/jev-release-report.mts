import { readFileSync } from "node:fs";
import {
  summarizeJevHoldout,
  type JevBenchmarkJudgment,
} from "../src/jevMetrics.js";

const path = process.argv[2];
if (!path)
  throw new Error(
    "Usage: node --import tsx scripts/jev-release-report.mts <judgments.json>",
  );
const rows: unknown = JSON.parse(readFileSync(path, "utf8"));
if (!Array.isArray(rows))
  throw new Error("Expected a JSON array of benchmark judgments");
const report = summarizeJevHoldout(rows as JevBenchmarkJudgment[]);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.passed) process.exitCode = 1;
