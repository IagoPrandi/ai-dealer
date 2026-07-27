import assert from "node:assert/strict";
import test from "node:test";
import {
  createSubmitGuessInstruction,
  deterministicGuess,
  readSeedConfig,
} from "./devnet-seed-real-inputs.js";
import { Keypair, PublicKey } from "@solana/web3.js";

test("M5 input seeding accepts up to 17 deterministic players", () => {
  assert.equal(
    readSeedConfig({ IDEALER_M5_INPUTS_PLAYER_COUNT: "17" }).playerCount,
    17,
  );

  assert.throws(
    () => readSeedConfig({ IDEALER_M5_INPUTS_PLAYER_COUNT: "18" }),
    /1 to 17/,
  );
});

test("M5 input seeding requires an explicit bounded paid-guess count", () => {
  assert.equal(
    readSeedConfig({
      IDEALER_M5_INPUTS_PAID_GUESS_PLAYER_COUNT: "3",
      IDEALER_M5_INPUTS_PLAYER_COUNT: "17",
    }).paidGuessPlayerCount,
    3,
  );
  assert.throws(
    () =>
      readSeedConfig({
        IDEALER_M5_INPUTS_PAID_GUESS_PLAYER_COUNT: "4",
        IDEALER_M5_INPUTS_PLAYER_COUNT: "3",
      }),
    /paid_guess_player_count/i,
  );
});

test("17 deterministic M5 guesses cover every possible draw number", () => {
  const covered = new Set<number>();
  for (let index = 0; index < 17; index += 1) {
    const guess = deterministicGuess(index);
    assert.equal(guess.length, 6);
    for (const number of guess) {
      assert.ok(number >= 1 && number <= 100);
      covered.add(number);
    }
  }

  assert.equal(covered.size, 100);
  for (let number = 1; number <= 100; number += 1) {
    assert.ok(covered.has(number), `missing ${number}`);
  }
});

test("M5 input seeding accepts only a canonical explicit guess", () => {
  assert.deepEqual(
    readSeedConfig({
      IDEALER_M5_INPUTS_GUESS_NUMBERS: "95,96,97,98,99,100",
    }).guessNumbers,
    [95, 96, 97, 98, 99, 100],
  );
  for (const invalid of [
    "1,2,3,4,5",
    "1,2,3,4,5,101",
    "1,2,3,3,4,5",
    "2,1,3,4,5,6",
  ]) {
    assert.throws(
      () =>
        readSeedConfig({
          IDEALER_M5_INPUTS_GUESS_NUMBERS: invalid,
        }),
      /six unique ascending integers/,
    );
  }
});

test("M5 paid guesses use the additional-guess instruction and a distinct PDA", () => {
  const player = Keypair.fromSeed(Uint8Array.from({ length: 32 }, () => 7));
  const programId = new PublicKey("ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd");
  const first = createSubmitGuessInstruction({
    numbers: [1, 2, 3, 4, 5, 6],
    player: player.publicKey,
    programId,
    sequence: 1,
    turnId: 34,
  });
  const second = createSubmitGuessInstruction({
    numbers: [1, 2, 3, 4, 5, 6],
    player: player.publicKey,
    programId,
    sequence: 2,
    turnId: 34,
  });

  assert.notEqual(
    first.accounts.playerGuess.toBase58(),
    second.accounts.playerGuess.toBase58(),
  );
  assert.deepEqual([...first.instruction.data.subarray(0, 8)], [61, 124, 32, 227, 64, 198, 252, 3]);
  assert.deepEqual([...second.instruction.data.subarray(0, 8)], [141, 186, 105, 183, 228, 255, 164, 47]);
});
