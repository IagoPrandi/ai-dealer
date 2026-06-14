export const RULE_MAX_TOKENS = 1000;
export const MAX_REMOVABLE_NUMBERS = 4;
export const LAMPORTS_PER_SOL = 1_000_000_000;

export const TURN_DURATION_CYCLE_HOURS = [2, 2, 8, 8] as const;
export const VOTE_FEE_START_TURN = 100;

export const MVP_FEES_SOL = {
  guessSubmission: 0.01,
  ruleProposal: 0.02,
  paidRuleRemoval: 0.05,
  vote: 0,
  report: 0
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

export { SHARED_ERROR_CODES, type SharedErrorCode } from "./error-codes.js";
