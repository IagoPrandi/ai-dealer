import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeTycheProgramError,
  parseTycheProgramErrorCode,
} from "./programErrors";

test("the decimal simulation dump a wallet shows is parsed", () => {
  // The exact shape a player reported from a failed prize claim.
  const diagnostic =
    "single Transaction simulation failed custom program error: #6068 SolanaError Program ComputeBudget111111111111111111111111111111 invoke [1]";

  assert.equal(parseTycheProgramErrorCode(diagnostic), 6068);
  assert.match(
    describeTycheProgramError(diagnostic) ?? "",
    /prize vault cannot cover this payout/,
  );
});

test("the hex form of the same failure resolves to the same code", () => {
  assert.equal(
    parseTycheProgramErrorCode("custom program error: 0x17b4"),
    6068,
  );
});

test("an Anchor error name is translated when no number is present", () => {
  const diagnostic =
    "Program log: AnchorError thrown in programs/tyche/src/lib.rs:2166. Error Code: ClaimNotAvailable. Error Number: 6066.";

  assert.equal(parseTycheProgramErrorCode(diagnostic), 6066);
  assert.match(
    describeTycheProgramError(diagnostic) ?? "",
    /not available to claim/,
  );
});

test("the numeric form wins over the name so a mismatch cannot mislead", () => {
  assert.equal(
    parseTycheProgramErrorCode(
      "custom program error: #6065 Error Code: ClaimNotAvailable.",
    ),
    6065,
  );
});

test("the two claim-solvency errors have distinct player copy", () => {
  const recorded = describeTycheProgramError("custom program error: #6077");
  const vault = describeTycheProgramError("custom program error: #6068");

  assert.ok(recorded);
  assert.ok(vault);
  assert.notEqual(recorded, vault);
});

test("an unknown program error is not flattened into friendly copy", () => {
  // A code with no mapping must keep its original diagnostic so a genuine
  // defect stays visible rather than being hidden behind reassuring text.
  assert.equal(parseTycheProgramErrorCode("custom program error: #6042"), 6042);
  assert.equal(describeTycheProgramError("custom program error: #6042"), null);
});

test("a diagnostic with no program error at all yields nothing", () => {
  assert.equal(
    parseTycheProgramErrorCode("Blockhash not found. Please retry."),
    null,
  );
  assert.equal(
    describeTycheProgramError("Blockhash not found. Please retry."),
    null,
  );
});

test("an unrecognised Anchor error name is left alone", () => {
  assert.equal(
    parseTycheProgramErrorCode("Error Code: AccountNotInitialized."),
    null,
  );
});
