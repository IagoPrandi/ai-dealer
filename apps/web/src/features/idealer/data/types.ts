/**
 * Types the Idealer UI consumes. The `*Api` types mirror the subset of the
 * Idealer API (apps/api) responses we read; the `Ui*` types are the
 * screen-facing shapes derived by the hooks in `hooks.ts`.
 */

/* ----------------------------- API shapes ----------------------------- */

export interface RuleProposalApi {
  compiledArtifactHash?: string | null;
  precompilationStatus?: "failed" | "passed" | "pending";
  proposer: string;
  ruleId: number;
  ruleProposal?: string;
  sanitizedText: string;
  state?: "eligible" | "invalidated" | "proposed" | "removed_paid";
  title?: string;
  tokenCount?: number;
  turnId?: number;
}

export interface RuleVoteApi {
  ruleId: number;
  signature: string;
  submittedAt?: string;
  turnId: number;
  voter: string;
}

export interface RuleVotesApi {
  counts: Record<string, number>;
  votes: RuleVoteApi[];
}

export interface EliminationFinalistApi {
  approvalVotes: number;
  eliminated: boolean;
  eliminationVotes: number;
  ruleId: number;
  status: "eliminated" | "survived";
  threshold: number;
}

export interface RoundSummaryApi {
  draw: {
    drawResult: number[] | null;
    drawnAt: string | null;
    status: string;
    turnId: number;
  } | null;
  election: {
    activeRuleId: number | null;
    eligibleRuleIds: number[];
    finalistRuleIds: number[];
    randomRuleIds: number[];
    status: "locked" | "original_only" | "requested" | "settled";
    topVotedRuleIds: number[];
  } | null;
  elimination: {
    decisionWindowClosesAt: string | null;
    eliminatedRuleIds: number[];
    finalists: EliminationFinalistApi[];
    status: "closed" | "not_started" | "open";
    survivorRuleIds: number[];
  };
  pool: {
    accounting: {
      buckets: {
        alternative: { rolloverLamports: number; totalLamports: number };
        original: { rolloverLamports: number; totalLamports: number };
      };
    };
    guesses: number;
    indicativeSol: number;
    totalVisiblePrizePoolSol: number;
  };
  rules: RoundSummaryRuleApi[];
  status: "completed" | "current" | "upcoming";
  totalVotes: number;
  turnId: number;
  winners?: WinnerSummaryApi;
}

export interface RoundSummaryRuleApi {
  proposer: string;
  ruleId: number;
  sanitizedText: string;
  state: "eligible" | "invalidated" | "proposed" | "removed_paid";
  title: string;
  tokenCount: number;
  votes: number;
}

export interface WinnerRecordApi {
  activeRuleId: number | null;
  category: "alternative" | "original";
  payoutLamports: number;
  player: string;
  turnId: number;
  winnerCount: number;
}

export interface WinnerCategorySummaryApi {
  bucketLamports: number;
  individualPayoutLamports: number;
  winnerCount: number;
}

export interface WinnerSummaryApi {
  alternative: WinnerCategorySummaryApi;
  original: WinnerCategorySummaryApi;
  records: WinnerRecordApi[];
  turnId: number;
}

export type ClaimKind = "creator_reward" | "voter_reward" | "winner_payout";
export type ClaimStatus =
  | "available"
  | "claimed"
  | "failed"
  | "pending_wallet_approval"
  | "unavailable";

export interface ClaimRecordApi {
  amountLamports: number;
  category: "alternative" | "original" | null;
  claimId: string;
  claimWindowExpiresAt?: string;
  kind: ClaimKind;
  status: ClaimStatus;
  statusReason: string;
  turnId: number;
}

export interface PlayerClaimsApi {
  availableLamports: number;
  claimedLamports: number;
  records: ClaimRecordApi[];
  totalLamports: number;
  wallet: string;
}

export interface GuessReceiptApi {
  numbers: number[];
  signature: string;
  submittedAt: string;
}

/* ----------------------------- UI shapes ----------------------------- */

/** A rule as the voting / detail UI needs it. `against` only exists for
 * finalists during the decision window (elimination votes); 0 otherwise. */
export interface UiRule {
  against: number;
  approve: number;
  created: string;
  finalist: boolean;
  handle: string;
  how: string;
  id: string;
  mine: boolean;
  removed: boolean;
  ruleId: number;
  ruleProposal: string | undefined;
  seed: string;
  src: "top" | "vrf" | null;
  state: RuleProposalApi["state"];
  summary: string;
  title: string;
  tokens: number;
  wallet: string;
}

/** Aggregated, screen-facing view of the active round. */
export interface UiRound {
  decisionEndsAt: number | null;
  decisionPhase: boolean;
  players: number;
  prizeSol: number;
  rulesCount: number;
  turnId: number;
}
