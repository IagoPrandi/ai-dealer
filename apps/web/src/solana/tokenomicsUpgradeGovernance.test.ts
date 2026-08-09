import assert from "node:assert/strict";
import test from "node:test";

import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import {
  TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG,
  governanceActionAvailability,
} from "./tokenomicsUpgradeGovernance";

const [walletA, walletB] = SQUADS_DEVNET_CONFIG.members;

test("pins governance to the reviewed Tyche upgrade proposal", () => {
  assert.equal(TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.transactionIndex, 11n);
  assert.equal(
    TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.proposalAddress,
    "CAZpmWqTDJdi7wPWds8gfXNGjFKeFNh9qw4hcgPJXA89",
  );
  assert.equal(
    TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.transactionAddress,
    "2wnXfMfDPbVhn5cvpfk56LWBJsotiASq81djyZ2o5NjR",
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

test("allows any authorized member to execute after the threshold", () => {
  const approved = [walletA!.address, walletB!.address];
  assert.deepEqual(
    governanceActionAvailability({
      approved,
      memberAddress: walletA!.address,
      status: "Approved",
    }),
    { canApprove: false, canExecute: true },
  );
  assert.deepEqual(
    governanceActionAvailability({
      approved,
      memberAddress: walletB!.address,
      status: "Approved",
    }),
    { canApprove: false, canExecute: true },
  );
});

test("keeps the second approval available before the threshold", () => {
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
