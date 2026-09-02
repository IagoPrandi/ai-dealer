export interface PublicRule {
  compiledArtifactHash: string | null;
  officialInterpretation: string | null;
  precompilationStatus: "failed" | "passed" | "pending";
  proposer: string;
  ruleId: number;
  sanitizedText: string;
  state: "eligible" | "invalidated" | "proposed" | "removed_paid";
  title: string;
  tokenCount: number;
  validation: null | {
    decision: "INVALID" | "VALID";
    finalConfidence: number;
    reasonCodes: string[];
    reasonSummary: string;
  };
  votes: number;
  workedExamples: Array<{
    draw: number[];
    guess: number[];
    outcome: "LOSE" | "WIN";
  }>;
}

export interface PublicRound {
  cycle: { durationHours: number; nextDurationHours: number; pattern: number[]; stepIndex: number };
  draw: null | {
    drawResult: number[] | null;
    randomnessSource: string | null;
    settleSignature: string | null;
    status: "failed" | "fulfilled" | "requested";
  };
  election: null | {
    activeRuleId: number | null;
    finalistRuleIds: number[];
    randomRuleIds: number[];
    status: "locked" | "original_only" | "requested" | "settled";
    topVotedRuleIds: number[];
  };
  elimination: {
    eliminatedRuleIds: number[];
    status: "closed" | "not_started" | "open";
    survivorRuleIds: number[];
  };
  pool: {
    guesses: number;
    indicativeSol: number;
    proposals: number;
    totalVisiblePrizePoolSol: number;
  };
  rules: PublicRule[];
  status: "completed" | "current" | "upcoming";
  totalVotes: number;
  turnId: number;
  winners?: {
    alternative: { bucketLamports: number; individualPayoutLamports: number; winnerCount: number };
    original: { bucketLamports: number; individualPayoutLamports: number; winnerCount: number };
  } | null;
}

export interface TransparencySnapshot {
  activeTurnId: number;
  generatedAt: string;
  totals: {
    claims: number;
    guesses: number;
    proposals: number;
    winnerPayoutLamports: number;
  };
  trends: {
    topCreators: Array<{
      creator: string;
      electedRules: number;
      proposedRules: number;
      rewardLamports: number;
      votesReceived: number;
      winnerProducingRules: number;
    }>;
  };
  turns: Array<{
    activity: { guesses: number; proposals: number; totalVotes: number };
    economy: { prizePoolLamports: number };
    proofs: { activeRuleId: number | null; auditChainHead: string | null };
    status: PublicRound["status"];
    turnId: number;
  }>;
}

export interface PublicRuleDetail {
  audit: Array<{ kind: string; logHash: string }>;
  election: { active: boolean; finalist: boolean; source: "random" | "top_voted" | null };
  elimination: null | {
    approvalVotes: number;
    eliminated: boolean;
    eliminationVotes: number;
    status: "eliminated" | "survived";
    threshold: number;
  };
  rule: PublicRule;
  status: PublicRound["status"];
  turnId: number;
}

export interface PublicPlayerProfile {
  stats: {
    eliminationVotesCast: number;
    guessesSubmitted: number;
    rulesElected: number;
    rulesProposed: number;
    totalEarnedLamports: number;
    votesCast: number;
    votesReceived: number;
    winnerProducingRules: number;
  };
  wallet: string;
}

export interface PublicAuditLog {
  commitmentHash: string;
  createdAt: string;
  inputHash: string;
  kind: string;
  logHash: string;
  outputHash: string;
  previousLogHash: string | null;
  publicStateRef: { key: string; type: string };
  reason: string;
  result: string;
  ruleId: number | null;
  turnId: number;
}
