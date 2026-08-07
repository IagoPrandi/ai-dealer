import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { AccountRole, address, getAddressEncoder } from "@solana/kit";
import bs58 from "bs58";
import {
  createSetVrfConfigInstruction,
  createTurnAutomationConfig,
  decodeGlobalConfigAccount,
  decodeTurnStateAccount,
  getTurnOpeningGate,
  isLegacyTurnDeserializationError,
  isTurnSettlementClosed,
  loadAuthorityKeypairBytesFromEnv,
  runTurnAutomationOnce,
  stringifySimulationError,
} from "./turn-automation.js";

const addressEncoder = getAddressEncoder();
const SET_VRF_CONFIG_DISCRIMINATOR = [53, 52, 195, 216, 205, 110, 46, 74];
const TURN_STATE_DISCRIMINATOR = [184, 240, 193, 137, 151, 216, 79, 187];

function writeU32Le(data: Uint8Array, offset: number, value: number) {
  new DataView(data.buffer).setUint32(offset, value, true);
}

function writeU64Le(data: Uint8Array, offset: number, value: number) {
  new DataView(data.buffer).setBigUint64(offset, BigInt(value), true);
}

function writeAddress(data: Uint8Array, offset: number, value: string) {
  data.set(addressEncoder.encode(address(value)), offset);
}

function turnStateData(length: 780 | 789) {
  const data = new Uint8Array(length);
  data.set(TURN_STATE_DISCRIMINATOR, 0);
  writeU64Le(data, 8, 42);
  writeU64Le(data, 16, 100);
  writeU64Le(data, 24, 900);
  data[32] = 0;
  const durationOffset = length === 789 ? 50 : 41;
  writeU32Le(data, durationOffset, 800);
  data[durationOffset + 4] = 3;
  return data;
}

test("turn automation decodes legacy and current TurnState offsets explicitly", () => {
  for (const length of [780, 789] as const) {
    assert.deepEqual(decodeTurnStateAccount(turnStateData(length)), {
      cycleIndex: 3,
      eliminationWindowEndTimestamp: 0,
      endTimestamp: 900,
      finalistCount: 0,
      finalistRuleIds: [],
      startTimestamp: 100,
      status: "open",
      turnDurationSeconds: 800,
      turnId: 42,
    });
  }
  assert.throws(
    () => decodeTurnStateAccount(new Uint8Array(789)),
    /recognized 780-byte legacy or 789-byte current layout/,
  );
});

test("current TurnState exposes finalist voting fields to the live status endpoint", () => {
  const data = turnStateData(789);
  data[261] = 2;
  writeU64Le(data, 262, 7);
  writeU64Le(data, 270, 11);
  new DataView(data.buffer).setBigInt64(496, 900n, true);

  assert.deepEqual(decodeTurnStateAccount(data), {
    cycleIndex: 3,
    eliminationWindowEndTimestamp: 900,
    endTimestamp: 900,
    finalistCount: 2,
    finalistRuleIds: [7, 11],
    startTimestamp: 100,
    status: "open",
    turnDurationSeconds: 800,
    turnId: 42,
  });
});

test("turn automation is disabled unless explicitly enabled", async () => {
  const config = await createTurnAutomationConfig({});

  assert.equal(config.enabled, false);
  assert.equal(config.authorityKeypairBytes, null);
  assert.equal(config.desiredTurnDurationCycle, null);
  assert.equal(config.intervalMs, 30_000);
  assert.equal(config.deferCloseToSettlement, false);
});

test("turn automation defers the close when settlement automation is enabled", async () => {
  const config = await createTurnAutomationConfig({
    TYCHE_SETTLEMENT_AUTOMATION_ENABLED: "true",
  });

  assert.equal(config.deferCloseToSettlement, true);
});

test("turn automation settlement gate accepts only a CLOSED transition", async () => {
  const closed = await isTurnSettlementClosed(
    14,
    "http://api.test",
    async () =>
      new Response(
        JSON.stringify({
          transitions: [{ toState: "FINALIZED" }, { toState: "CLOSED" }],
        }),
        { status: 200 },
      ),
  );
  const incomplete = await isTurnSettlementClosed(
    14,
    "http://api.test",
    async () => new Response(JSON.stringify({ transitions: [{ toState: "FINALIZED" }] })),
  );

  assert.equal(closed, true);
  assert.equal(incomplete, false);
});

test("turn opening gate identifies the previous incomplete settlement", async () => {
  const gate = await getTurnOpeningGate(
    { hasActiveTurn: false, nextTurnId: 25 },
    "http://api.test",
    async () =>
      new Response(JSON.stringify({ transitions: [{ toState: "CLAIMABLE" }] }), {
        status: 200,
      }),
  );

  assert.deepEqual(gate, {
    blockingTurnId: 24,
    canOpen: false,
    code: "PREVIOUS_TURN_SETTLEMENT_PENDING",
  });
});

test("turn automation settlement gate fails closed on an invalid API response", async () => {
  await assert.rejects(
    isTurnSettlementClosed(
      14,
      "http://api.test",
      async () => new Response(JSON.stringify({ transitions: null })),
    ),
    /invalid response/,
  );
});

test("turn automation can be explicitly enabled for the worker loop", async () => {
  const config = await createTurnAutomationConfig({
    TYCHE_TURN_AUTOMATION_ENABLED: "true",
    TYCHE_TURN_AUTOMATION_INTERVAL_MS: "10000",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.authorityKeypairBytes, null);
  assert.equal(config.desiredTurnDurationCycle, null);
  assert.equal(config.intervalMs, 10_000);
});

test("turn automation resolves shortened devnet duration cycle", async () => {
  const config = await createTurnAutomationConfig({
    TYCHE_DEVNET_TURN_DURATION_SCALE_BPS: "1500",
  });

  // 15% of the 24h production turn (86400s) = 12960s per slot.
  assert.deepEqual(config.desiredTurnDurationCycle, [
    12_960, 12_960, 12_960, 12_960,
  ]);
});

test("turn automation validates Solana keypair byte shape", async () => {
  await assert.rejects(
    loadAuthorityKeypairBytesFromEnv({
      TYCHE_TURN_AUTHORITY_KEYPAIR: JSON.stringify([1, 2, 3]),
    }),
    /64-byte Solana keypair JSON array or base58-encoded/,
  );
});

test("turn automation accepts a base58-encoded authority keypair", async () => {
  const keypairBytes = Uint8Array.from(
    Array.from({ length: 64 }, (_, index) => index),
  );
  const parsed = await loadAuthorityKeypairBytesFromEnv({
    TYCHE_TURN_AUTHORITY_KEYPAIR: bs58.encode(keypairBytes),
  });

  assert.deepEqual(parsed, keypairBytes);
});

test("turn automation prefers authority keypair path over inline value", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tyche-worker-"));
  try {
    const pathBytes = Uint8Array.from(
      Array.from({ length: 64 }, (_, index) => 63 - index),
    );
    const inlineBytes = Uint8Array.from(
      Array.from({ length: 64 }, (_, index) => index),
    );
    const keypairPath = join(dir, "authority.json");
    await writeFile(keypairPath, JSON.stringify([...pathBytes]));

    const parsed = await loadAuthorityKeypairBytesFromEnv({
      TYCHE_TURN_AUTHORITY_KEYPAIR_PATH: keypairPath,
      TYCHE_TURN_AUTHORITY_KEYPAIR: bs58.encode(inlineBytes),
    });

    assert.deepEqual(parsed, pathBytes);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("turn automation stringifies simulation errors containing bigint values", () => {
  assert.equal(
    stringifySimulationError({ InstructionError: [0n, { Custom: 6001n }] }),
    '{"InstructionError":["0",{"Custom":"6001"}]}',
  );
});

test("turn automation detects legacy active turn deserialization failures", () => {
  assert.equal(
    isLegacyTurnDeserializationError(
      new Error(
        'Turn automation transaction simulation failed: {"InstructionError":["0",{"Custom":"3003"}]}; logs=["Program log: AnchorError caused by account: turn_state. Error Code: AccountDidNotDeserialize. Error Number: 3003. Error Message: Failed to deserialize the account."]',
      ),
    ),
    true,
  );
  assert.equal(
    isLegacyTurnDeserializationError(new Error("TurnNotEnded")),
    false,
  );
});

test("turn automation disabled check has no RPC side effects", async () => {
  const result = await runTurnAutomationOnce({
    authorityKeypairBytes: null,
    deferCloseToSettlement: false,
    desiredTurnDurationCycle: null,
    enabled: false,
    intervalMs: 30_000,
    programId: address("ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd"),
    rpcUrl: "http://127.0.0.1:9",
  });

  assert.deepEqual(result, { action: "disabled" });
});

test("global config decoder exposes configured VRF addresses", () => {
  const authority = "4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH";
  const pendingAuthority = "DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp";
  const drawVrfConfig = "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7";
  const electionVrfConfig = "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7";
  const data = new Uint8Array(288);
  writeAddress(data, 8, authority);
  data[40] = 1;
  writeAddress(data, 41, pendingAuthority);
  writeAddress(data, 105, drawVrfConfig);
  writeAddress(data, 137, electionVrfConfig);
  writeU32Le(data, 203, 7_200);
  writeU32Le(data, 207, 7_200);
  writeU32Le(data, 211, 28_800);
  writeU32Le(data, 215, 28_800);
  writeU64Le(data, 260, 1);
  writeU64Le(data, 268, 0);

  const snapshot = decodeGlobalConfigAccount(data);

  assert.equal(snapshot.authority, authority);
  assert.equal(snapshot.pendingAuthority, pendingAuthority);
  assert.equal(snapshot.drawVrfConfig, drawVrfConfig);
  assert.equal(snapshot.electionVrfConfig, electionVrfConfig);
  assert.deepEqual(snapshot.turnDurationCycle, [7_200, 7_200, 28_800, 28_800]);
});

test("set VRF config instruction is governed by canonical ProgramData authority", async () => {
  const governanceAuthority = address(
    "DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp",
  );
  const programId = address("ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd");
  const globalConfig = address("8eAwKD514LK6rJYLLFZh92g3V5a5MwbyLZMU83EpWWZ");
  const programData = address("AWGUseV1DEsoSvdW7CDMxxBDUPQXAKqTXyxHVzeTnL8g");
  const drawVrfConfig = address("EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7");
  const electionVrfConfig = address(
    "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7",
  );

  const instruction = await createSetVrfConfigInstruction({
    governanceAuthority,
    drawVrfConfig,
    electionVrfConfig,
    programId,
  });

  assert.equal(instruction.programAddress, programId);
  assert.deepEqual(
    Array.from(instruction.data.slice(0, 8)),
    SET_VRF_CONFIG_DISCRIMINATOR,
  );
  assert.equal(instruction.data.length, 72);
  assert.deepEqual(Array.from(instruction.data.slice(8, 40)), [
    ...addressEncoder.encode(drawVrfConfig),
  ]);
  assert.deepEqual(Array.from(instruction.data.slice(40, 72)), [
    ...addressEncoder.encode(electionVrfConfig),
  ]);
  assert.deepEqual(instruction.accounts, [
    { address: governanceAuthority, role: AccountRole.READONLY_SIGNER },
    { address: globalConfig, role: AccountRole.WRITABLE },
    { address: programData, role: AccountRole.READONLY },
  ]);
});

test("enabled turn automation requires an authority keypair", async () => {
  await assert.rejects(
    runTurnAutomationOnce({
      authorityKeypairBytes: null,
      deferCloseToSettlement: false,
    desiredTurnDurationCycle: null,
      enabled: true,
      intervalMs: 10_000,
      programId: address("ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd"),
      rpcUrl: "http://127.0.0.1:9",
    }),
    /TYCHE_TURN_AUTHORITY_KEYPAIR/,
  );
});
