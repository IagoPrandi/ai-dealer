# API Contracts

All public API routes are versioned under `/api/v1`. Response bodies use JSON. Mutating requests must pass an `Idempotency-Key` header unless explicitly marked read-only.

## Response Envelope

```ts
interface ApiSuccess<T> {
  ok: true;
  data: T;
  request_id: string;
}

interface ApiError {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  request_id: string;
}
```

## Shared Models

```ts
type RuleState =
  | "DRAFT"
  | "PREFLIGHT_PENDING"
  | "PREFLIGHT_PASSED"
  | "PROPOSED"
  | "PRECOMPILING"
  | "PRECOMPILED_VALID"
  | "ELIGIBLE_FOR_ELECTION"
  | "FINALIST_SET_MEMBER"
  | "VRF_ELECTED"
  | "FROZEN"
  | "ACTIVE"
  | "EXPIRED"
  | "PREFLIGHT_BLOCKED"
  | "PRECOMPILATION_FAILED"
  | "NEEDS_CLARIFICATION"
  | "REJECTED_UNSUPPORTED"
  | "REJECTED_DUPLICATE"
  | "REJECTED_TOO_EASY"
  | "REJECTED_ALWAYS_TRUE"
  | "REJECTED_IMPOSSIBLE"
  | "REPORTED"
  | "REMOVED_PAID"
  | "INVALIDATED"
  | "CANCELLED_BY_TURN_END";

interface PublicRule {
  rule_id: string;
  turn_id: string;
  title: string;
  original_text: string;
  simplified_explanation: string;
  creator_wallet: string;
  token_count: number;
  vote_count: number;
  status: RuleState;
  difficulty_label?: "EASY" | "MEDIUM" | "HARD" | "EXTREME";
  clarity_score?: number;
  audit_url: string;
}
```

## Current Round

`GET /api/v1/turns/current`

Returns the currently open turn, pool summary, countdowns, current leading/active rule, and user action availability.

```ts
interface CurrentTurnResponse {
  turn_id: string;
  status: "OPEN" | "ELECTION_LOCKED" | "DRAW_PENDING" | "VERIFYING" | "COMPLETE";
  duration_hours: 1 | 2 | 8;
  cycle_index: 0 | 1 | 2 | 3 | 4 | 5;
  starts_at: string;
  ends_at: string;
  election_closes_at: string;
  guesses_close_at: string;
  prize_pool_lamports: string;
  treasury_fee_bps: number;
  creator_reward_rate_bps: number;
  active_rule?: PublicRule;
  leading_rules: PublicRule[];
}
```

## Token Count

`POST /api/v1/rules/token-count`

```ts
interface TokenCountRequest {
  text: string;
}

interface TokenCountResponse {
  token_count: number;
  max_tokens: 80;
  within_limit: boolean;
}
```

## Rule Preflight

`POST /api/v1/rules/preflight`

Requires current-turn Game Token ownership. Does not collect payment. Returns a short-lived signed `preflight_token` when all gates pass.

```ts
interface RulePreflightRequest {
  turn_id: string;
  player_wallet: string;
  rule_text: string;
}

interface RulePreflightResult {
  valid: boolean;
  turn_id: string;
  player_wallet: string;
  token_count: number;
  max_tokens: 80;
  prohibited_reference_result: "PASS" | "BLOCK";
  dedup_result: RuleDedupResult;
  preflight_token?: string;
  preflight_token_expires_at?: string;
  rejection_reasons?: string[];
}
```

## Rule Proposal

`POST /api/v1/rules/propose`

Requires `preflight_token`, current-turn Game Token PDA, signed proposal/payment transaction reference, and idempotency key.

```ts
interface RuleProposalRequest {
  turn_id: string;
  player_wallet: string;
  rule_text: string;
  preflight_token: string;
  proposal_transaction_signature: string;
}

interface RuleProposalResponse {
  rule_id: string;
  turn_id: string;
  status: "PROPOSED";
  precompilation_job_id: string;
}
```

## Voting

`POST /api/v1/rules/{rule_id}/vote`

Requires current-turn Game Token PDA. Votes are ultimately recorded on-chain through `RuleVote` accounts or equivalent on-chain account model.

```ts
interface VoteRequest {
  turn_id: string;
  player_wallet: string;
  vote_transaction_signature: string;
}

interface VoteResponse {
  rule_id: string;
  turn_id: string;
  wallet: string;
  vote_count: number;
  status: "CAST" | "CHANGED";
}
```

## Prize Pool Accounting

`GET /api/v1/turns/{turn_id}/accounting`

Returns deterministic lamport-level accounting for the turn. The current local API compatibility endpoint is `GET /prize-pool-accounting/{turn_id}`.

```ts
interface PrizePoolFeeSourceAccounting {
  count: number;
  feeLamports: number;
  grossLamports: number;
  treasuryLamports: number;
  prizeLamports: number;
}

interface PrizePoolAccountingResponse {
  turnId: number;
  sources: {
    guessSubmissions: PrizePoolFeeSourceAccounting;
    ruleProposals: PrizePoolFeeSourceAccounting;
    paidRuleRemovals: PrizePoolFeeSourceAccounting;
    votes: PrizePoolFeeSourceAccounting & { feeActive: boolean };
  };
  treasuryLamports: number;
  platformMonetizationLamports: number;
  currentTurnPoolLamports: number;
  buckets: {
    original: {
      currentTurnLamports: number;
      rolloverLamports: number;
      totalLamports: number;
    };
    alternative: {
      currentTurnLamports: number;
      rolloverLamports: number;
      totalLamports: number;
    };
  };
  totalVisiblePrizePoolLamports: number;
  nextRolloverIfNoWinnersLamports: {
    original: number;
    alternative: number;
  };
}
```

Local compatibility endpoints added for M4.1 projections:

- `POST /rule-removals`
- `GET /rule-removals?turnId={turn_id}`
- `POST /prize-pool-rollovers`
- `GET /prize-pool-rollovers?turnId={turn_id}`
- `GET /prize-pool-accounting/{turn_id}`

## Results

`GET /api/v1/turns/{turn_id}/results`

```ts
interface TurnResultsResponse {
  turn_id: string;
  draw_numbers: [number, number, number, number, number, number];
  original_winner_count: number;
  alternative_winner_count: number;
  original_bucket_lamports: string;
  alternative_bucket_lamports: string;
  active_rule?: PublicRule;
  payouts_available: boolean;
}
```

Current local API compatibility endpoints for M4.2 winner projection:

- `POST /winner-records/calculate-turn`
- `GET /winner-records?turnId={turn_id}`

```ts
type WinnerCategory = "original" | "alternative";

interface WinnerRecord {
  turnId: number;
  category: WinnerCategory;
  player: string;
  resultId: string;
  activeRuleId: number | null;
  bucketLamports: number;
  winnerCount: number;
  payoutLamports: number;
  status: "calculated";
  calculatedAt: string;
}

interface WinnerCalculationSummary {
  turnId: number;
  original: {
    bucketLamports: number;
    winnerCount: number;
    individualPayoutLamports: number;
    remainderLamports: number;
  };
  alternative: {
    bucketLamports: number;
    winnerCount: number;
    individualPayoutLamports: number;
    remainderLamports: number;
  };
  records: WinnerRecord[];
}
```

Current local API compatibility endpoints for M4.3 creator and voter reward projection:

- `POST /reward-records/calculate-turn`
- `GET /reward-records?turnId={turn_id}`

```ts
interface CreatorRewardRecord {
  turnId: number;
  activeRuleId: number;
  creatorWallet: string;
  winnerCount: number;
  individualAltPayoutLamports: number;
  rewardRateBps: number;
  calculatedRewardLamports: number;
  availableReserveLamports: number;
  capPerTurnLamports: number;
  finalRewardLamports: number;
  wasCapped: boolean;
  status: "calculated" | "not_available";
  calculatedAt: string;
}

interface VoterRewardRecord {
  turnId: number;
  activeRuleId: number;
  voter: string;
  voterCount: number;
  individualAltPayoutLamports: number;
  rewardRateBps: number;
  rewardPoolLamports: number;
  finalRewardLamports: number;
  status: "calculated" | "not_available";
  calculatedAt: string;
}

interface RewardCalculationSummary {
  turnId: number;
  activeRuleId: number | null;
  creatorRewardReserveLamports: number;
  remainingReserveLamports: number;
  creator: CreatorRewardRecord | null;
  voterRewardPool: {
    rewardRateBps: number;
    capPerTurnLamports: number;
    calculatedPoolLamports: number;
    finalPoolLamports: number;
    individualRewardLamports: number;
    remainderLamports: number;
    voterCount: number;
    wasCapped: boolean;
  };
  voters: VoterRewardRecord[];
}
```

Current local API compatibility endpoints for M4.4 claim flow:

- `POST /claim-records/create-turn`
- `GET /claim-records?turnId={turn_id}&wallet={wallet}`
- `POST /claim-records/request`
- `POST /claim-records/complete`

```ts
type ClaimKind = "winner_payout" | "creator_reward" | "voter_reward";
type ClaimRecordStatus =
  | "available"
  | "pending_wallet_approval"
  | "claimed"
  | "failed"
  | "unavailable";

interface ClaimRecord {
  claimId: string;
  turnId: number;
  wallet: string;
  kind: ClaimKind;
  category: "original" | "alternative" | null;
  activeRuleId: number | null;
  amountLamports: number;
  sourceRecordKey: string;
  status: ClaimRecordStatus;
  statusReason: string;
  availableAt: string;
  claimWindowExpiresAt: string;
  claimWindowTurns: number;
  claimedAt: string | null;
  failedAt: string | null;
  walletApproval: {
    required: true;
    state: "not_requested" | "pending" | "approved" | "failed";
    transactionLabel: string;
    approvalStartedAt: string | null;
    completedAt: string | null;
    signature: string | null;
    failureReason: string | null;
  };
}

interface ClaimSummary {
  turnId: number;
  wallet: string | null;
  availableLamports: number;
  pendingLamports: number;
  claimedLamports: number;
  failedLamports: number;
  records: ClaimRecord[];
}
```

## History

`GET /api/v1/players/{wallet}/history?cursor=...&limit=...`

Returns paginated guess, vote, rule proposal, near-miss, payout, and creator reward history. Default limit is 25; maximum limit is 100.

Current local compatibility endpoint:

- `GET /players/{wallet}/history?cursor=...&limit=...`

```ts
type PlayerHistoryEventType =
  | "claim"
  | "elimination_vote"
  | "guess"
  | "rule_proposal"
  | "vote";

interface PlayerHistoryEvent {
  id: string;
  type: PlayerHistoryEventType;
  turnId: number;
  title: string;
  summary: string;
  status: string;
  createdAt: string;
  ruleId?: number;
  amountLamports?: number;
}

interface PlayerHistoryPage {
  wallet: string;
  cursor: string | null;
  nextCursor: string | null;
  limit: number;
  events: PlayerHistoryEvent[];
}
```

## AI Conversation Drafts

Current local compatibility endpoints:

- `GET /players/{wallet}/conversation-drafts`
- `POST /players/{wallet}/conversation-drafts`

Draft writes are wallet-scoped. The body wallet must match the path wallet.

```ts
type ConversationDraftStatus = "draft" | "submitted";

interface ConversationDraftRecord {
  draftId: string;
  wallet: string;
  turnId: number;
  prompt: string;
  normalizedText: string | null;
  officialInterpretation: string | null;
  lastMessage: string;
  tokenCount: number;
  ruleId: number | null;
  status: ConversationDraftStatus;
  createdAt: string;
  updatedAt: string;
}
```

## Audit

Required public audit endpoints:

- `GET /api/v1/turns/{turn_id}`
- `GET /api/v1/turns/{turn_id}/rules`
- `GET /api/v1/turns/{turn_id}/draw`
- `GET /api/v1/turns/{turn_id}/results`
- `GET /api/v1/turns/{turn_id}/traces`
- `GET /api/v1/turns/{turn_id}/election`
- `GET /api/v1/rules/{rule_id}`
- `GET /api/v1/rules/{rule_id}/preflight`
- `GET /api/v1/players/{wallet}/history`

Audit endpoints must expose hashes, versions, and status transitions without exposing secrets, raw provider prompts, or sensitive admin notes.

Current local API compatibility endpoints:

- `GET /audit?turnId={turn_id}&kind=compiler.validation`
- `GET /audit?turnId={turn_id}&kind=guess.verification`
- `GET /audit?turnId={turn_id}&kind=rule.election.proof`
- `GET /audit?turnId={turn_id}&kind=settlement.transition`
- `GET /audit/{log_hash}`

```ts
interface PublicAuditLog {
  schemaVersion: 1;
  kind:
    | "compiler.validation"
    | "guess.verification"
    | "rule.election.proof"
    | "rule.removal"
    | "settlement.transition";
  turnId: number;
  ruleId: number | null;
  player: string | null;
  validationLogId: string | null;
  resultId: string | null;
  publicStateRef: {
    type:
      | "rule_validation"
      | "guess_verification_result"
      | "rule_election"
      | "rule_removal"
      | "settlement_transition";
    key: string;
  };
  inputHash: string;
  outputHash: string;
  logHash: string;
  previousLogHash: string | null;
  commitmentHash: string;
  commitmentMechanism: "postgres_hash_chain_v1";
  result: string;
  reason: string;
}
```

`rule.election.proof` records expose the M9.0 recomputation material: eligible
candidate commitments, finalist and survivor rule id sets, Switchboard
randomness accounts/sources/values for finalist and active election, hash domain
names, rejection-sampling algorithm descriptions, and the final active rule id
plus artifact hashes. A settled election with an active alternative rule must not
publish this proof unless both VRF fulfillment values are present.
