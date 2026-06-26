import assert from "node:assert/strict";
import test from "node:test";
import {
  deterministicGuess,
  readSeedConfig,
} from "./devnet-seed-real-inputs.js";

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
