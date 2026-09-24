import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { canonicalJson } from "@tyche/rule-compiler";

import {
  CLAIM_LEDGER_QUESTION_SET_VERSION,
  serializeClaimLedger,
  type ClaimLedger,
} from "./ruleClaimLedger.js";

// Server-signed record that THIS server verified THIS claim ledger for THIS
// sanitized text at interpret time. It lets the compile phase skip asking Jev
// the same questions about the same ledger again: J12 measured that second
// call flipping a verified ledger to REVIEW in 2 of 68 runs (Jev scores near
// the 0.80 band edge vary from call to call), and it cost a Jev call per rule.
//
// The client still cannot forge a verdict: the MAC key never leaves the
// server, and any change to the text, the ledger, or the question-set version
// invalidates it. A missing, stale, or invalid attestation is not an error; the
// compile phase then re-verifies the ledger with Jev exactly as before.
// Code checks (spans, material terms) always re-run, attested or not.

export const LEDGER_ATTESTATION_VERSION = "v1" as const;
/** An approval older than this is re-verified; long enough for a player's retries. */
export const LEDGER_ATTESTATION_TTL_MS = 6 * 60 * 60 * 1000;
export const LEDGER_ATTESTATION_MAX_LENGTH = 200;
const MIN_KEY_LENGTH = 32;

let processKey: Buffer | null = null;

/**
 * `TYCHE_RULE_LEDGER_ATTESTATION_KEY` (at least 32 characters) shares
 * attestations across API instances and restarts. Unset, each process uses its
 * own random key: attestations then hold only within that process, and every
 * other compile re-verifies with Jev, the pre-attestation behaviour.
 */
export function resolveLedgerAttestationKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const configured = (env.TYCHE_RULE_LEDGER_ATTESTATION_KEY ?? "").trim();
  if (configured) {
    if (configured.length < MIN_KEY_LENGTH) {
      throw new Error(`TYCHE_RULE_LEDGER_ATTESTATION_KEY must be at least ${MIN_KEY_LENGTH} characters.`);
    }
    return Buffer.from(configured, "utf8");
  }
  processKey ??= randomBytes(32);
  return processKey;
}

function mac(key: Buffer, issuedAtMs: number, sanitizedText: string, ledger: ClaimLedger): string {
  const payload = canonicalJson({
    issuedAtMs,
    ledger: serializeClaimLedger(ledger),
    questionSet: CLAIM_LEDGER_QUESTION_SET_VERSION,
    text: sanitizedText,
    verdict: "LEDGER_VERIFIED",
    version: LEDGER_ATTESTATION_VERSION,
  });
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export function issueLedgerAttestation(args: {
  key: Buffer;
  ledger: ClaimLedger;
  nowMs: number;
  sanitizedText: string;
}): string {
  return `${LEDGER_ATTESTATION_VERSION}.${args.nowMs}.${mac(args.key, args.nowMs, args.sanitizedText, args.ledger)}`;
}

export type LedgerAttestationCheck = "absent" | "expired" | "invalid" | "valid";

export function checkLedgerAttestation(args: {
  attestation: string | null;
  key: Buffer;
  ledger: ClaimLedger;
  nowMs: number;
  sanitizedText: string;
}): LedgerAttestationCheck {
  if (args.attestation === null) return "absent";
  const match = /^v1\.(\d{1,15})\.([A-Za-z0-9_-]{43})$/u.exec(args.attestation);
  if (!match) return "invalid";
  const issuedAtMs = Number(match[1]);
  const expected = Buffer.from(mac(args.key, issuedAtMs, args.sanitizedText, args.ledger));
  const given = Buffer.from(match[2]!);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return "invalid";
  // A future timestamp cannot come from this key's issuer; treat it as invalid.
  if (issuedAtMs > args.nowMs + 60_000) return "invalid";
  return args.nowMs - issuedAtMs > LEDGER_ATTESTATION_TTL_MS ? "expired" : "valid";
}
