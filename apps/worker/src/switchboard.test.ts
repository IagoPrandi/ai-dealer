import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSwitchboardProofConfig,
  extractSwitchboardRandomnessValue,
  setConfiguredVrfToSwitchboardDevnet,
  SWITCHBOARD_DEVNET_ON_DEMAND,
} from "./switchboard.js";

test("switchboard devnet defaults expose the on-demand queue", () => {
  assert.deepEqual(SWITCHBOARD_DEVNET_ON_DEMAND, {
    programId: "Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2",
    queue: "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7",
    queuePda: "DLfvpUBDZaHi2D4nAKxdkNwCVDU7esu5WKHwfHdjbeTs",
  });
});

test("switchboard proof config requires an authority keypair", async () => {
  await assert.rejects(
    createSwitchboardProofConfig({
      IDEALER_SOLANA_RPC_URL: "https://api.devnet.solana.com",
    }),
    /IDEALER_TURN_AUTHORITY_KEYPAIR/,
  );
});

test("direct VRF configuration is disabled in favor of Squads governance", async () => {
  await assert.rejects(
    setConfiguredVrfToSwitchboardDevnet({}),
    /Create and execute a Squads proposal/,
  );
});

test("switchboard randomness value extraction rejects missing or zero values", () => {
  assert.throws(
    () => extractSwitchboardRandomnessValue({ value: new Uint8Array(32) }),
    /all zero bytes/,
  );
  assert.throws(
    () => extractSwitchboardRandomnessValue({ value: [1, 2, 3] }),
    /32-byte array/,
  );
  assert.throws(
    () => extractSwitchboardRandomnessValue({ value: Array(32).fill("1") }),
    /32-byte array/,
  );
});

test("switchboard randomness value extraction returns a non-zero 32-byte value", () => {
  const value = Uint8Array.from(
    Array.from({ length: 32 }, (_, index) => index + 1),
  );

  assert.deepEqual(extractSwitchboardRandomnessValue({ value }), value);
});
