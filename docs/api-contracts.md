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

## History

`GET /api/v1/players/{wallet}/history?cursor=...&limit=...`

Returns paginated guess, vote, rule proposal, near-miss, payout, and creator reward history. Default limit is 25; maximum limit is 100.

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
- `GET /audit/{log_hash}`

```ts
interface PublicAuditLog {
  schemaVersion: 1;
  kind: "compiler.validation" | "guess.verification";
  turnId: number;
  ruleId: number | null;
  player: string | null;
  validationLogId: string | null;
  resultId: string | null;
  publicStateRef: {
    type: "rule_validation" | "guess_verification_result";
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
