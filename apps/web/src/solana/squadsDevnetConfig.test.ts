import assert from "node:assert/strict";
import test from "node:test";

import {
  SQUADS_DEVNET_CONFIG,
  validateMultisigSnapshot,
  validateSquadsDevnetConfig,
} from "./squadsDevnetConfig";

test("the Squads rehearsal configuration is a valid devnet-only 2-of-3", () => {
  assert.deepEqual(validateSquadsDevnetConfig(), []);
  assert.equal(SQUADS_DEVNET_CONFIG.members[0]?.label, "Wallet A");
  assert.equal(
    SQUADS_DEVNET_CONFIG.members[0]?.address,
    "EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea",
  );
});

test("a matching on-chain snapshot passes strict verification", () => {
  assert.deepEqual(
    validateMultisigSnapshot({
      configAuthority: null,
      members: SQUADS_DEVNET_CONFIG.members.map((member) => ({
        address: member.address,
        permissionMask: SQUADS_DEVNET_CONFIG.permissionMask,
      })),
      owner: SQUADS_DEVNET_CONFIG.programId,
      rentCollector: null,
      threshold: SQUADS_DEVNET_CONFIG.threshold,
      timeLockSeconds: SQUADS_DEVNET_CONFIG.timeLockSeconds,
    }),
    [],
  );
});

test("verification rejects a wrong owner, member permission, and time lock", () => {
  const errors = validateMultisigSnapshot({
    configAuthority: "ConfigAuthority111111111111111111111111111",
    members: SQUADS_DEVNET_CONFIG.members.map((member, index) => ({
      address: member.address,
      permissionMask: index === 0 ? 2 : SQUADS_DEVNET_CONFIG.permissionMask,
    })),
    owner: "11111111111111111111111111111111",
    rentCollector: null,
    threshold: SQUADS_DEVNET_CONFIG.threshold,
    timeLockSeconds: 604_800,
  });

  assert.ok(errors.some((error) => error.includes("not owned")));
  assert.ok(errors.some((error) => error.includes("config authority")));
  assert.ok(errors.some((error) => error.includes("all permissions")));
  assert.ok(errors.some((error) => error.includes("not immediate")));
});
