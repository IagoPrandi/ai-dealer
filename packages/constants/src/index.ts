export const RULE_MAX_TOKENS = 1000;
export const MAX_REMOVABLE_NUMBERS = 4;
export const LAMPORTS_PER_SOL = 1_000_000_000;

// Production turn timing (PRD §5.4): every turn lasts 24h and is composed of
// phase 1 (create rules + pick numbers, ~22h) followed by phase 2 (finalist
// shortlist, elimination voting, active rule, draw at turn end, ~2h). The
// phase-1 → phase-2 boundary is RULE_ELECTION_CUTOFF_BPS of the turn duration;
// guesses close at the same boundary (GUESS_CUTOFF_BPS). 9167 bps of 24h =
// 79202s ≈ 22h (basis points cannot express 22/24 exactly; the ~2s drift is
// accepted). The 4-slot cycle machinery is retained with equal slots.
export const TURN_DURATION_CYCLE_HOURS = [24, 24, 24, 24] as const;
export const TURN_DURATION_CYCLE_SECONDS = [86_400, 86_400, 86_400, 86_400] as const;
export const RULE_ELECTION_CUTOFF_BPS = 9_167;
export const GUESS_CUTOFF_BPS = 9_167;
export const TEST_TURN_DURATION_SCALE_BPS = 1_500;
export const VOTE_FEE_START_TURN = 100;
export const REPEATED_ACTION_FEE_MULTIPLIER = 2;

export const MVP_FEES_SOL = {
  guessSubmission: 0.01,
  ruleProposal: 0.02,
  paidRuleRemoval: 0.05,
  vote: 0.005,
  report: 0
} as const;

// Paid rule removal protections (PRD §6.11 RULE_REMOVAL_CONFIG). A rule with
// community momentum cannot be removed by paid player action: the creator may
// not self-remove once it reaches `minVotesCreatorSelfRemove` votes, and a
// third party faces the higher `minVotesThirdPartyRemove` threshold. The
// removal fee always goes to the current turn prize pool.
export const RULE_REMOVAL_CONFIG = {
  minVotesCreatorSelfRemove: 5,
  minVotesThirdPartyRemove: 15,
  removalFeeDestination: "prize_pool",
} as const;

export const TREASURY_FEE_BPS = 500;
export const CREATOR_REWARD_RATE_BPS = 1_500;
export const CREATOR_REWARD_RESERVE_SHARE_BPS = 2_000;
export const CREATOR_REWARD_CAP_SOL = 0.25;
export const VOTER_REWARD_RATE_BPS = 1_500;
export const VOTER_REWARD_CONFIG = {
  capPerTurnLamports: 250_000_000
} as const;
export const MINIMUM_CLAIM_THRESHOLD_SOL = 0.005;
export const CLAIM_WINDOW_TURNS = 12;
export const CLAIM_WINDOW_DAYS = 7;

export function countRuleTokens(value: string) {
  return value.match(/\p{L}+|\p{N}+|[^\s\p{L}\p{N}]/gu)?.length ?? 0;
}

function removeControlCharacters(value: string) {
  return Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0);

      return codePoint !== undefined && (codePoint < 32 || codePoint === 127)
        ? " "
        : character;
    })
    .join("");
}

export function sanitizeRuleText(value: string) {
  return removeControlCharacters(value).replace(/\s+/g, " ").trim();
}

export { SHARED_ERROR_CODES, type SharedErrorCode } from "./error-codes.js";
