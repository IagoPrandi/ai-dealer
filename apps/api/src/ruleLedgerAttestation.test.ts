import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkLedgerAttestation,
  issueLedgerAttestation,
  LEDGER_ATTESTATION_TTL_MS,
  resolveLedgerAttestationKey,
} from "./ruleLedgerAttestation.js";
import type { ClaimLedger } from "./ruleClaimLedger.js";

const KEY = Buffer.from("k".repeat(32));
const TEXT = "Win if at least 3 of your numbers are drawn.";
const LEDGER: ClaimLedger = {
  claims: [{ dimension: "win_condition", id: "c1", meaning: "Win if at least 3 of your numbers are drawn.", sourceSpan: "Win if at least 3 of your numbers are drawn" }],
  openChoices: [],
};
const NOW = 1_800_000_000_000;
const token = issueLedgerAttestation({ key: KEY, ledger: LEDGER, nowMs: NOW, sanitizedText: TEXT });
const check = (overrides: Partial<Parameters<typeof checkLedgerAttestation>[0]>) =>
  checkLedgerAttestation({ attestation: token, key: KEY, ledger: LEDGER, nowMs: NOW + 1_000, sanitizedText: TEXT, ...overrides });

test("an attestation verifies only for the same text, ledger, and key", () => {
  assert.equal(check({}), "valid");
  assert.equal(check({ sanitizedText: "Win if at least 4 of your numbers are drawn." }), "invalid");
  assert.equal(check({ ledger: { ...LEDGER, claims: [{ ...LEDGER.claims[0]!, meaning: "Win if 3 of your numbers are drawn." }] } }), "invalid");
  assert.equal(check({ key: Buffer.from("x".repeat(32)) }), "invalid");
  assert.equal(check({ attestation: null }), "absent");
});

test("a forged, re-dated, expired, or future attestation never verifies", () => {
  const [version, issued, mac] = token.split(".");
  assert.equal(check({ attestation: `${version}.${Number(issued) + 1}.${mac}` }), "invalid");
  assert.equal(check({ attestation: `${version}.${issued}.${"A".repeat(43)}` }), "invalid");
  assert.equal(check({ attestation: "not-a-token" }), "invalid");
  assert.equal(check({ nowMs: NOW + LEDGER_ATTESTATION_TTL_MS + 1 }), "expired");
  const future = issueLedgerAttestation({ key: KEY, ledger: LEDGER, nowMs: NOW + 120_000, sanitizedText: TEXT });
  assert.equal(check({ attestation: future, nowMs: NOW }), "invalid");
});

test("the attestation key is configurable, validated, and otherwise per process", () => {
  assert.throws(() => resolveLedgerAttestationKey({ TYCHE_RULE_LEDGER_ATTESTATION_KEY: "short" }), /32 characters/u);
  assert.equal(resolveLedgerAttestationKey({ TYCHE_RULE_LEDGER_ATTESTATION_KEY: "z".repeat(40) }).toString(), "z".repeat(40));
  const first = resolveLedgerAttestationKey({});
  assert.equal(first.length, 32);
  assert.ok(resolveLedgerAttestationKey({}).equals(first));
});
