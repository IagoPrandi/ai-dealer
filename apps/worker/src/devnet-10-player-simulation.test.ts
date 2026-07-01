import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  parseSolToLamports,
  readTenPlayerSimulationConfig,
  readValidRulePromptsFromMarkdown,
} from "./devnet-10-player-simulation.js";

test("10-player simulation defaults to the required rule prompt test set", () => {
  const config = readTenPlayerSimulationConfig({});
  assert.equal(config.promptFile, "docs/rule-proposal-prompt-test-set.md");
  assert.equal(config.promptMarkdown, null);
  assert.equal(config.apiBaseUrl, "http://127.0.0.1:3002");
  assert.equal(config.funderKeypairPath, null);
  assert.equal(config.fundLamportsPerPlayer, 2_000_000_000);
});

test("10-player simulation reads funder wallet config", () => {
  const config = readTenPlayerSimulationConfig({
    IDEALER_10P_SIM_FUNDER_KEYPAIR_PATH: "/tmp/funder.json",
    IDEALER_10P_SIM_FUNDER_SOL_PER_PLAYER: "0.25",
  });

  assert.equal(config.funderKeypairPath, "/tmp/funder.json");
  assert.equal(config.fundLamportsPerPlayer, 250_000_000);
});

test("10-player simulation parses SOL funding amounts to lamports", () => {
  assert.equal(parseSolToLamports("2"), 2_000_000_000);
  assert.equal(parseSolToLamports("0.000000001"), 1);
  assert.throws(() => parseSolToLamports("0"), /safe positive lamport/);
  assert.throws(() => parseSolToLamports("0.0000000001"), /up to 9 decimal/);
});

test("10-player simulation reads the first 10 VALID rule prompts", () => {
  const markdown = readFileSync(
    new URL("../../../docs/rule-proposal-prompt-test-set.md", import.meta.url),
    "utf8",
  );
  const prompts = readValidRulePromptsFromMarkdown(markdown);

  assert.equal(prompts.length, 10);
  assert.equal(
    prompts[0],
    "Win if at least 4 guessed numbers appear in the draw, regardless of order.",
  );
  assert.equal(
    prompts[9],
    "Win if the smallest guessed number equals the smallest drawn number.",
  );
  assert.ok(prompts.every((prompt) => !prompt.includes("BLOCK")));
});

test("10-player simulation rejects prompt files without enough valid prompts", () => {
  assert.throws(
    () => readValidRulePromptsFromMarkdown("| # | Expected | Prompt |\n| 1 | VALID | One. |"),
    /10 required/,
  );
});
