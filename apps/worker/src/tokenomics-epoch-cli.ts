import { readFile } from "node:fs/promises";

import {
  calculateEpochInTypescript,
  requireIndependentEpochAgreement,
  runRustEpochCalculator,
  type EpochCalculatorInput,
} from "./tokenomics-epoch.js";

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error("usage: pnpm tokenomics:calculate <epoch-input.json>");
}

const input = JSON.parse(
  await readFile(inputPath, "utf8"),
) as EpochCalculatorInput;
const rust = await runRustEpochCalculator(inputPath);
const agreement = requireIndependentEpochAgreement(input, rust);

process.stdout.write(
  `${JSON.stringify(
    {
      agreed: agreement.agreed,
      calculation: calculateEpochInTypescript(input),
    },
    null,
    2,
  )}\n`,
);
