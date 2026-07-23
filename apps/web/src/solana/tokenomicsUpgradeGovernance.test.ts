import assert from "node:assert/strict";
import test from "node:test";

import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import {
  TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG,
  governanceActionAvailability,
} from "./tokenomicsUpgradeGovernance";

const [walletA, walletB] = SQUADS_DEVNET_CONFIG.members;

test("pins governance to the finalized Squads proposal", () => {
  assert.equal(TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.transactionIndex, 2n);
  assert.equal(
    TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.proposalAddress,
    "Hnhnm1x1vUb7AKk1mnSC4MFdy9vpMTDNreY38CKhhkHS",
  );
  assert.equal(
    TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.transactionAddress,
    "6vziiip4rKcVc7TppkBhbYRYrNxYn4c6adDFi1cxvQoY",
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
