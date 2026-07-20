import assert from "node:assert/strict";
import test from "node:test";

import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import {
  TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG,
  governanceActionAvailability,
} from "./tokenomicsUpgradeGovernance";

const [walletA, walletB] = SQUADS_DEVNET_CONFIG.members;

test("pins governance to the finalized Squads proposal", () => {
  assert.equal(TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.transactionIndex, 1n);
  assert.equal(
    TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.proposalAddress,
    "FcAvvrTxyYLSpmEYWBhrNvHy7Cr7FNART8a4SK9Wbgj",
  );
  assert.equal(
    TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.transactionAddress,
    "2QA55QJb97P9TJVQ6LqXusqcEY8cazfHGf2t8ysZpzAk",
  );
});

test("allows each member to approve only once while active", () => {
  assert.deepEqual(
    governanceActionAvailability({
      approved: [],
      memberAddress: walletA!.address,
      status: "Active",
    }),
    { canApprove: true, canExecute: false },
  );
  assert.deepEqual(
    governanceActionAvailability({
      approved: [walletA!.address],
      memberAddress: walletA!.address,
      status: "Active",
    }),
    { canApprove: false, canExecute: false },
  );
});

test("allows execution only after the 2-of-3 proposal is approved", () => {
  assert.deepEqual(
    governanceActionAvailability({
      approved: [walletA!.address, walletB!.address],
      memberAddress: walletB!.address,
      status: "Approved",
    }),
    { canApprove: false, canExecute: true },
  );
  assert.deepEqual(
    governanceActionAvailability({
      approved: [walletA!.address],
      memberAddress: walletB!.address,
      status: "Active",
    }),
    { canApprove: true, canExecute: false },
  );
});

test("rejects unknown accounts for both governance actions", () => {
  assert.deepEqual(
    governanceActionAvailability({
      approved: [walletA!.address, walletB!.address],
      memberAddress: "11111111111111111111111111111111",
      status: "Approved",
    }),
    { canApprove: false, canExecute: false },
  );
});
