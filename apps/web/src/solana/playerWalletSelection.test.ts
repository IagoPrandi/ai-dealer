import assert from "node:assert/strict";
import test from "node:test";

import { resolvePlayerWalletSource } from "./playerWalletSelection";

test("an explicitly selected external wallet overrides the email wallet", () => {
  assert.equal(
    resolvePlayerWalletSource({
      embeddedAvailable: true,
      externalAvailable: true,
      preferredSource: "external",
    }),
    "external",
  );
});

test("an email-login selection does not silently fall back to an external wallet", () => {
  assert.equal(
    resolvePlayerWalletSource({
      embeddedAvailable: true,
      externalAvailable: true,
      preferredSource: "embedded",
    }),
    "embedded",
  );
});

test("a preserved external Wallet Standard session remains active by default", () => {
  assert.equal(
    resolvePlayerWalletSource({
      embeddedAvailable: false,
      externalAvailable: true,
      preferredSource: null,
    }),
    "external",
  );
});
