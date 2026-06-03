# Queue and Job Contracts

Workers consume durable jobs from Redis-backed queues in development and a production queue backend later. Database idempotency records are required regardless of queue provider.

## Job Envelope

```ts
interface JobEnvelope<TPayload> {
  job_id: string;
  job_type: JobType;
  idempotency_key: string;
  trace_id: string;
  payload: TPayload;
  attempt: number;
  max_attempts: number;
  run_after: string;
  timeout_ms: number;
}

type JobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "RETRYING" | "DEAD_LETTERED" | "CANCELLED";
```

## Required Job Types

| Job Type | Purpose | Idempotency Key | Retry |
|---|---|---|---|
| `rule.validation` | Run precompilation pipeline and persist artifact/cache result. | `rule.validation:{rule_id}:{original_text_hash}` | 3 attempts, exponential backoff. |
| `guess.verification` | Evaluate original and active alternative rule for a player guess. | `guess.verification:{turn_id}:{wallet}:{draw_hash}:{artifact_hash}` | 5 attempts, exponential backoff. |
| `payout.calculation` | Calculate payout records, rollover, minimum threshold, and creator reward records. | `payout.calculation:{turn_id}:{results_hash}` | 5 attempts, fail closed. |
| `metric.aggregation` | Aggregate product, economy, compiler, and abuse metrics. | `metric.aggregation:{window_start}:{window_end}` | 3 attempts. |
| `admin.snapshot` | Persist dashboard snapshots for admin views. | `admin.snapshot:{snapshot_type}:{window_start}:{window_end}` | 3 attempts. |

## Failure States

- `RETRYING`: transient dependency error, timeout, rate limit, or provider unavailability.
- `DEAD_LETTERED`: max attempts exhausted; requires admin visibility and manual review.
- `CANCELLED`: turn ended or source object entered a terminal state that makes the job obsolete.

## Job Payloads

### `rule.validation`

```ts
interface RuleValidationJobPayload {
  rule_id: string;
  turn_id: string;
  original_text_hash: string;
  compiler_version: string;
  runtime_version: string;
  test_harness_version: string;
}
```

### `guess.verification`

```ts
interface GuessVerificationJobPayload {
  turn_id: string;
  wallet: string;
  guess_hash: string;
  draw_hash: string;
  active_rule_id?: string;
  compiled_artifact_hash?: string;
}
```

### `payout.calculation`

```ts
interface PayoutCalculationJobPayload {
  turn_id: string;
  results_hash: string;
  original_bucket_lamports: string;
  alternative_bucket_lamports: string;
  creator_reward_reserve_lamports: string;
}
```

### `metric.aggregation`

```ts
interface MetricAggregationJobPayload {
  window_start: string;
  window_end: string;
  dimensions: string[];
}
```

### `admin.snapshot`

```ts
interface AdminSnapshotJobPayload {
  snapshot_type: "activation" | "retention" | "engagement" | "economy" | "compiler" | "abuse";
  window_start: string;
  window_end: string;
}
```
