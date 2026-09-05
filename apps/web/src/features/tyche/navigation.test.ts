import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getPlayResultPath,
  getPlayScreenPath,
  getScreenForPlayPath,
} from "./navigation";

describe("play route navigation", () => {
  it("maps every public game destination in both directions", () => {
    assert.equal(getPlayScreenPath("home"), "/play");
    assert.equal(getPlayScreenPath("create"), "/play/propose");
    assert.equal(getPlayScreenPath("vote"), "/play/rules");
    assert.equal(getPlayScreenPath("profile"), "/play/account");
    assert.equal(getPlayScreenPath("claims"), "/play/claims");
    assert.equal(getPlayScreenPath("result"), "/play/results");
    assert.equal(getPlayResultPath(42), "/play/results/42");
    assert.equal(getScreenForPlayPath("/play/my-rules"), "myrules");
    assert.equal(getScreenForPlayPath("/play/guesses"), "guesses");
    assert.equal(getScreenForPlayPath("/play/invite"), "invite");
  });

  it("maps the result index and rejects unknown URLs", () => {
    assert.equal(getScreenForPlayPath("/play/results"), "result");
    assert.equal(getScreenForPlayPath("/play/not-real"), null);
  });
});
