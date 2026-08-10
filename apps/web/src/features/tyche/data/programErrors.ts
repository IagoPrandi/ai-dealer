/**
 * Plain-English copy for the Tyche program errors a player can actually hit.
 *
 * A failed instruction otherwise reaches the screen as the raw simulation dump
 * ("custom program error: #6068 ... invoke [1]"), which tells a player nothing
 * about what to do. Only codes reachable from an action the app itself submits
 * are translated; anything else keeps its original diagnostic so a real defect
 * stays visible instead of being flattened into friendly-sounding noise.
 *
 * Codes are `6000 + variant index` of `TycheError` in
 * `contracts/solana/programs/tyche/src/lib.rs`. Keep both sides in step: a
 * variant inserted anywhere but the end shifts every later code.
 */
export const TYCHE_PROGRAM_ERROR_MESSAGES: Readonly<Record<number, string>> =
  Object.freeze({
    6001: "The protocol is paused right now. Nothing was submitted.",
    6005: "This round is no longer open, so the action was not accepted.",
    6008: "This round's action window has closed.",
    6019: "Every number must be between 1 and 100.",
    6020: "The numbers must all be different.",
    6026: "This round pass is not valid for your wallet in this round.",
    6027: "This round pass has already been used up.",
    6028: "This rule can no longer be voted on.",
    6031: "Another action from this wallet is still settling. Wait for it to confirm, then try again.",
    6065: "This payout is below the minimum claim amount.",
    6066: "This prize is not available to claim. It may already be claimed or past its claim window.",
    6067: "This claim does not match the prize pool it was requested from.",
    6068: "The round's prize vault cannot cover this payout yet. Nothing was charged - please report this round so it can be reconciled.",
    6077: "This payout is larger than the round's prize vault can cover.",
    6081: "This prize is still inside its claim window and cannot be released yet.",
  });

/**
 * Anchor error names, for runtimes that surface the name but not the number.
 * Same rule: only player-reachable errors belong here.
 */
const TYCHE_PROGRAM_ERROR_NAMES: Readonly<Record<string, number>> =
  Object.freeze({
    ActionWindowClosed: 6008,
    ClaimBelowMinimum: 6065,
    ClaimExceedsPrizeVault: 6077,
    ClaimKindMismatch: 6067,
    ClaimNotAvailable: 6066,
    ClaimWindowStillOpen: 6081,
    DuplicateGuessNumber: 6020,
    InactiveGameToken: 6027,
    InsufficientVaultBalance: 6068,
    InvalidActionSequence: 6031,
    InvalidGameToken: 6026,
    InvalidGuessNumber: 6019,
    ProtocolPaused: 6001,
    RuleNotVoteable: 6028,
    TurnNotOpen: 6005,
  });

/**
 * Pull a Tyche program error code out of a simulation/transaction diagnostic.
 *
 * The runtime spells the same failure several ways depending on where it was
 * caught: `custom program error: #6068`, the hex `custom program error: 0x17b4`,
 * or Anchor's `Error Code: ClaimNotAvailable`. Returns null when the text holds
 * no recognisable code, so the caller can keep the original message.
 */
export function parseTycheProgramErrorCode(diagnostic: string): number | null {
  const decimal = /custom program error:\s*#(\d+)/i.exec(diagnostic);
  if (decimal?.[1]) {
    return Number.parseInt(decimal[1], 10);
  }

  const hex = /custom program error:\s*0x([0-9a-f]+)/i.exec(diagnostic);
  if (hex?.[1]) {
    return Number.parseInt(hex[1], 16);
  }

  const named = /Error Code:\s*([A-Za-z]+)/.exec(diagnostic);
  const code = named?.[1] ? TYCHE_PROGRAM_ERROR_NAMES[named[1]] : undefined;
  return code ?? null;
}

/** Player-facing copy for a diagnostic, or null when it is not a known error. */
export function describeTycheProgramError(diagnostic: string): string | null {
  const code = parseTycheProgramErrorCode(diagnostic);
  if (code === null) {
    return null;
  }
  return TYCHE_PROGRAM_ERROR_MESSAGES[code] ?? null;
}
