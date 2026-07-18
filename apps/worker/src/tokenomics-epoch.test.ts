import assert from "node:assert/strict";
import { test } from "node:test";

import {
  calculateEpochInTypescript,
  requireIndependentEpochAgreement,
  type EpochCalculatorInput,
} from "./tokenomics-epoch.js";

const key = (value: number) =>
  Buffer.from(new Uint8Array(32).fill(value)).toString("hex");

const input: EpochCalculatorInput = {
  epochId: "7",
  finalisedFeesLamports: "10",
  network: "devnet",
  positions: [
    { beneficiary: key(1), position: key(11), weight: "2" },
    { beneficiary: key(2), position: key(12), weight: "1" },
  ],
  programId: key(9),
  rolloverInLamports: "1",
};

test("TypeScript calculator produces exact epoch totals and root", () => {
  const output = calculateEpochInTypescript(input);
  assert.equal(output.grossDistributableLamports, "11");
  assert.equal(output.sumOfMerkleClaimsLamports, "10");
  assert.equal(output.roundingDustLamports, "1");
  assert.equal(output.rolloverOutLamports, "1");
  assert.deepEqual(
    output.claims.map((claim) => claim.amountLamports),
    ["7", "3"],
  );
  assert.equal(
    output.merkleRoot,
    "07c1f0bef54acc6cba7ee2107ca6074a6eaa700045de197c7ab2fdc4768dbbd4",
  );
});

test("independent agreement fails closed on any Rust mismatch", () => {
  const output = calculateEpochInTypescript(input);
  assert.equal(requireIndependentEpochAgreement(input, output).agreed, true);
  assert.throws(
    () =>
      requireIndependentEpochAgreement(input, {
        ...output,
        roundingDustLamports: "2",
      }),
    /tokenomics_epoch_calculator_disagreement/,
  );
});
