import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getPlayScreenPath, getScreenForPlayPath } from "./navigation";

describe("play route navigation", () => {
  it("maps every public game destination in both directions", () => {
    assert.equal(getPlayScreenPath("home"), "/play");
    assert.equal(getPlayScreenPath("create"), "/play/propose");
    assert.equal(getPlayScreenPath("vote"), "/play/rules");
    assert.equal(getPlayScreenPath("profile"), "/play/account");
    assert.equal(getPlayScreenPath("claims"), "/play/claims");
    assert.equal(getScreenForPlayPath("/play/my-rules"), "myrules");
    assert.equal(getScreenForPlayPath("/play/guesses"), "guesses");
    assert.equal(getScreenForPlayPath("/play/invite"), "invite");
  });

  it("does not turn result or unknown URLs into an internal screen", () => {
    assert.equal(getPlayScreenPath("result"), null);
    assert.equal(getScreenForPlayPath("/play/not-real"), null);
  });
});
