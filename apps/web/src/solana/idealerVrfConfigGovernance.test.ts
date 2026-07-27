import assert from "node:assert/strict";
import test from "node:test";

import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import {
  IDEALER_VRF_CONFIG_GOVERNANCE_CONFIG,
  vrfGovernanceActionAvailability,
} from "./idealerVrfConfigGovernance";

const [walletA, walletB] = SQUADS_DEVNET_CONFIG.members;

test("pins governance to the finalized ORAO activation proposal", () => {
  assert.equal(IDEALER_VRF_CONFIG_GOVERNANCE_CONFIG.transactionIndex, 8n);
  assert.equal(
    IDEALER_VRF_CONFIG_GOVERNANCE_CONFIG.proposalAddress,
    "6jgmTQPCuesEaUzqgbAwD8zpV3uZVtizDJSG7MUFkPqN",
  );
  assert.equal(
    IDEALER_VRF_CONFIG_GOVERNANCE_CONFIG.transactionAddress,
    "736SgRStuJi7K1uSZJZenmxMVeZ489zU1N2qFm2Cs2Bd",
  );
});

test("allows two distinct approvals before ORAO execution", () => {
  assert.deepEqual(
    vrfGovernanceActionAvailability({
      approved: [],
      memberAddress: walletA!.address,
      status: "Active",
    }),
    { canApprove: true, canExecute: false },
  );
  assert.deepEqual(
    vrfGovernanceActionAvailability({
      approved: [walletA!.address],
      memberAddress: walletA!.address,
      status: "Active",
    }),
    { canApprove: false, canExecute: false },
  );
  assert.deepEqual(
    vrfGovernanceActionAvailability({
      approved: [walletA!.address],
      memberAddress: walletB!.address,
      status: "Active",
    }),
    { canApprove: true, canExecute: false },
  );
});

test("allows a known member to execute only after threshold", () => {
  assert.deepEqual(
    vrfGovernanceActionAvailability({
      approved: [walletA!.address, walletB!.address],
      memberAddress: walletA!.address,
      status: "Approved",
    }),
    { canApprove: false, canExecute: true },
  );
  assert.deepEqual(
    vrfGovernanceActionAvailability({
      approved: [walletA!.address, walletB!.address],
      memberAddress: "11111111111111111111111111111111",
      status: "Approved",
    }),
    { canApprove: false, canExecute: false },
  );
});
