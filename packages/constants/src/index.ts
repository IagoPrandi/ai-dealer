export const RULE_MAX_TOKENS = 1000;
export const MAX_REMOVABLE_NUMBERS = 4;
export const LAMPORTS_PER_SOL = 1_000_000_000;

// How long the API keeps a finished rule preflight job addressable so a client
// that lost its connection can reattach and replay the result. Shared with the
// web client, which drops a locally-stored job pointer older than this without
// a network round-trip; keeping one source of truth stops the two from drifting.
export const PREFLIGHT_JOB_TTL_MS = 10 * 60 * 1000;

// Production turn timing (PRD §5.4): every turn lasts 24h and is composed of
// phase 1 (create rules + pick numbers, ~22h) followed by phase 2 (finalist
// shortlist, elimination voting, active rule, draw at turn end, ~2h). The
// phase-1 → phase-2 boundary is RULE_ELECTION_CUTOFF_BPS of the turn duration;
// guesses close at the same boundary (GUESS_CUTOFF_BPS). 9167 bps of 24h =
// 79202s ≈ 22h (basis points cannot express 22/24 exactly; the ~2s drift is
// accepted). The 4-slot cycle machinery is retained with equal slots.
export const TURN_DURATION_CYCLE_HOURS = [24, 24, 24, 24] as const;
export const TURN_DURATION_CYCLE_SECONDS = [
  86_400, 86_400, 86_400, 86_400,
] as const;
export const RULE_ELECTION_CUTOFF_BPS = 9_167;
export const GUESS_CUTOFF_BPS = 9_167;
export const TEST_TURN_DURATION_SCALE_BPS = 1_500;
export const PRODUCTION_FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX = 30;
export const DEVELOPMENT_FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX = 100;

export function resolveFreeActionWindowEndsBeforeTurnIndex(
  network: string | undefined,
) {
  return network === "mainnet" || network === "mainnet-beta"
    ? PRODUCTION_FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX
    : DEVELOPMENT_FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX;
}

export const FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX =
  resolveFreeActionWindowEndsBeforeTurnIndex(
    process.env.NEXT_PUBLIC_SOLANA_NETWORK ??
      process.env.SOLANA_NETWORK ??
      process.env.TYCHE_NETWORK,
  );
/** @deprecated Use FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX. */
export const VOTE_FEE_START_TURN = FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX;
export const REPEATED_ACTION_FEE_MULTIPLIER = 2;

export const MVP_FEES_SOL = {
  guessSubmission: 0.01,
  ruleProposal: 0.02,
  paidRuleRemoval: 0.05,
  vote: 0.005,
  report: 0,
} as const;

// Paid rule removal protections. Only the rule creator may remove their rule,
// and creator self-removal is blocked once it reaches
// `minVotesCreatorSelfRemove` votes. `minVotesThirdPartyRemove` is retained for
// account/config compatibility with older deployments but is no longer used for
// new removal decisions. The removal fee always goes to the current turn prize
// pool.
export const RULE_REMOVAL_CONFIG = {
  minVotesCreatorSelfRemove: 5,
  minVotesThirdPartyRemove: 15,
  removalFeeDestination: "prize_pool",
} as const;

export const TREASURY_FEE_BPS = 500;
// Active-rule creator reward and elected-rule voter pool are each this share of
// one individual alternative-rule winner payout (PRD-TOKENOMICS §5.3.1). Both
// legs always use the same rate, so they share one declaration.
export const ACTIVE_RULE_REWARD_RATE_BPS = 2_250;
export const CREATOR_REWARD_RATE_BPS = ACTIVE_RULE_REWARD_RATE_BPS;
export const CREATOR_REWARD_RESERVE_SHARE_BPS = 2_000;
export const CREATOR_REWARD_CAP_SOL = 0.25;
export const VOTER_REWARD_RATE_BPS = ACTIVE_RULE_REWARD_RATE_BPS;
export const VOTER_REWARD_CONFIG = {
  capPerTurnLamports: 250_000_000,
} as const;

// JDR promotional-campaign reward economics (PRD-TOKENOMICS §5.2–5.4). This is
// the canonical TypeScript source consumed by @tyche/tokenomics, the API and
// the web app, and it is mirrored by
// contracts/solana/programs/tokenomics_core/src/domain.rs. Atom amounts use nine
// decimals: 1 JDR = 1_000_000_000 atoms.
export const CAMPAIGN_REWARD_BPS_DENOMINATOR = 10_000n;
/** Economic hash recorded by the superseded devnet campaign 0 deployment. */
export const CAMPAIGN_V1_ECONOMIC_CONFIG_HASH =
  "145e7abde160c7d6828624eb12f320b570b674ad46708659cf5e640751854efd";
/** Economic hash required by every v2 campaign settlement path. */
export const CAMPAIGN_V2_ECONOMIC_CONFIG_HASH =
  "a1704f86ab599164dafad02ea09d84829ed5976100f826533a5e9caa64de7994";
/** Frozen exhaustion-only policy shared by the v1 and v2 campaign records. */
export const CAMPAIGN_UNUSED_BALANCE_POLICY_HASH =
  "92f6153e1c48440fa5f7bf5e8fa45523a3d3956e6fd762b41ca2097c4522dbfd";
/** 0.6 JDR per confirmed `propose_rule` action. */
export const PROPOSAL_REWARD_ATOMS = 600_000_000n;
/** 0.09 JDR per confirmed in-favour `vote` action — 15% of the proposal reward. */
export const SUPPORTER_REWARD_ATOMS = 90_000_000n;
/** 0.2 JDR for the inviter once a referral qualifies. */
export const REFERRAL_INVITER_REWARD_ATOMS = 200_000_000n;
/** The invitee base reward as a share of the inviter base reward. */
export const REFERRAL_INVITEE_REWARD_RATE_BPS = 15_000n;
/** 0.3 JDR for the invitee — 150% of the inviter reward. */
export const REFERRAL_INVITEE_REWARD_ATOMS =
  (REFERRAL_INVITER_REWARD_ATOMS * REFERRAL_INVITEE_REWARD_RATE_BPS) /
  CAMPAIGN_REWARD_BPS_DENOMINATOR;
/**
 * The inviter's one-time bonus as a share of the campaign rewards actually paid
 * to the invitee during the invitee's first playing round.
 */
export const REFERRAL_INVITER_FIRST_ROUND_BONUS_RATE_BPS = 2_250n;
/** Independent 0.25 JDR cap for the creator reward and for the voter pool. */
export const ACTIVE_RULE_REWARD_CAP_ATOMS = 250_000_000n;
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
