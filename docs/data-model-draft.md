# Data Model Draft

This is the M0.4 PostgreSQL model draft. On-chain accounts remain the source of truth for funds, uniqueness constraints, Game Token validity, votes, and critical authorization.

## Conventions

- Primary IDs are UUIDs unless they mirror on-chain PDA or transaction identifiers.
- Lamports are stored as `numeric(20,0)` or text in APIs to avoid JavaScript precision loss.
- Wallets are stored as base58 text with validation at API and contract boundaries.
- Every mutable domain table has `created_at` and `updated_at`.
- Event ingestion tables must be idempotent by transaction signature plus event index.

## Core Tables

| Table | Purpose | Key Constraints |
|---|---|---|
| `turns` | Turn projection and lifecycle state. | Unique `turn_number`; indexed `status`, `starts_at`, `ends_at`. |
| `rules` | Proposed rules and public rule state. | Unique `rule_id`; indexed `turn_id`, `creator_wallet`, `state`. |
| `rule_votes` | On-chain vote projection. | Unique `(turn_id, rule_id, wallet)`. |
| `rule_removal_records` | Paid removal records. | Unique `(turn_id, rule_id, remover_wallet)`. |
| `conversation_drafts` | Wallet-scoped AI dealer draft projection for resumable rule conversations. | Unique `draft_id`; indexed `wallet`, `updated_at`. |
| `prize_pool_rollovers` | Per-bucket rollover input for the next turn. | Unique `turn_id`; non-negative original and alternative rollover lamports. |
| `prize_pool_accounting_snapshots` | Deterministic source, treasury, bucket, and visible-pool accounting snapshots. | Unique `(turn_id, accounting_version)`. |
| `game_tokens_index` | Indexed Game Token PDA metadata. | Unique `(turn_id, wallet)`. |
| `guesses` | Player guesses and submission metadata. | Unique `(turn_id, wallet)`. |
| `gate_check_logs` | Preflight gate logs. | Indexed `turn_id`, `player_wallet`, `gate_type`, `result`. |
| `rule_dedup_results` | Semantic and canonical dedup outputs. | One result per preflight attempt. |
| `rule_preflight_tokens` | Short-lived token issuance audit. | Unique `token_hash`; expires quickly. |
| `rule_precompilation_cache` | Background compilation cache. | Unique `(rule_id, original_text_hash)`. |
| `agent_logs` | Compiler agent logs, separate from gate checks. | Indexed `rule_id`, `agent_name`, `result`. |
| `audit_logs` | Public validation and verification audit trail with hash-chain commitments. | Unique `log_hash`; indexed `turn_id`, `log_kind`, public state ref. |
| `verification_jobs` | Guess and payout verification orchestration. | Unique idempotency key. |
| `compiled_rule_artifacts` | Hashable DSL/AST artifacts and version metadata. | Unique `artifact_hash`. |
| `election_vrf_records` | Switchboard election request/fulfillment projection. | Unique `turn_id`. |
| `rule_finalist_sets` | Locked finalist set and hashes. | Unique `turn_id`. |
| `payout_records` | Winner payout projection and claim state. | Unique `(turn_id, wallet, category)`. |
| `winner_records` | M4.2 calculated original and alternative winners before claim records are finalized. | Unique `(turn_id, wallet, category)`. |
| `creator_reward_records` | Creator reward projection. | Unique `(turn_id, active_rule_id, creator_wallet)`. |
| `idempotency_records` | API and worker idempotency. | Unique `idempotency_key`. |
| `creator_profiles` | Creator aggregate profile projection. | Unique `wallet`. |
| `activity_feed` | Public feed projection. | Indexed `turn_id`, `created_at`. |
| `share_events` | Share-card analytics. | Indexed `turn_id`, `wallet`, `created_at`. |
| `metrics_snapshots` | Admin/product metrics snapshots. | Indexed `snapshot_type`, `window_start`, `window_end`. |
| `rule_registry_embeddings` | Rule text embeddings for dedup. | HNSW index on vector column. |

## Important Columns

### `turns`

```sql
turn_id text primary key,
turn_number bigint unique not null,
status text not null,
cycle_index smallint not null,
duration_hours smallint not null,
starts_at timestamptz not null,
ends_at timestamptz not null,
election_closes_at timestamptz not null,
guesses_close_at timestamptz not null,
prize_pool_lamports numeric(20,0) not null default 0,
draw_numbers smallint[],
active_rule_id text,
finalist_set_hash text,
draw_vrf_fulfillment_ref text
```

### `prize_pool_accounting_snapshots`

M4.1 accounting snapshots are deterministic projections from indexed fee sources, configured fees, treasury basis points, and per-bucket rollover inputs. Original and alternative buckets are stored separately so payout calculation can reconcile each category independently.

```sql
turn_id text not null references turns(turn_id),
accounting_version text not null,
guess_submission_count integer not null,
rule_proposal_count integer not null,
paid_rule_removal_count integer not null,
vote_fee_count integer not null,
gross_fees_lamports numeric(20,0) not null,
treasury_lamports numeric(20,0) not null,
current_turn_pool_lamports numeric(20,0) not null,
original_current_lamports numeric(20,0) not null,
alternative_current_lamports numeric(20,0) not null,
original_rollover_lamports numeric(20,0) not null,
alternative_rollover_lamports numeric(20,0) not null,
original_total_lamports numeric(20,0) not null,
alternative_total_lamports numeric(20,0) not null,
total_visible_prize_pool_lamports numeric(20,0) not null,
created_at timestamptz not null,
primary key (turn_id, accounting_version)
```

### `winner_records`

Winner records are calculated from completed deterministic guess verification results. They remain category-specific because a wallet may win the original rule, the active alternative rule, or both.

```sql
turn_id text not null references turns(turn_id),
category text not null check (category in ('original', 'alternative')),
player_wallet text not null,
result_id text not null,
active_rule_id text,
bucket_lamports numeric(20,0) not null,
winner_count integer not null,
payout_lamports numeric(20,0) not null,
status text not null,
calculated_at timestamptz not null,
primary key (turn_id, player_wallet, category)
```

### `rules`

```sql
rule_id text primary key,
turn_id text not null references turns(turn_id),
creator_wallet text not null,
state text not null,
original_text text not null,
original_text_hash text not null,
normalized_text_hash text,
official_interpretation_hash text,
compiled_artifact_hash text,
token_count integer not null,
vote_count integer not null default 0,
report_count integer not null default 0,
preflight_result_hash text,
created_at timestamptz not null,
updated_at timestamptz not null
```

### `conversation_drafts`

AI dealer drafts are off-chain UI state. They do not authorize proposals or replace the on-chain rule proposal source of truth; submitted proposals still require the normal `propose_rule` transaction and API projection.

```sql
draft_id text primary key,
wallet text not null,
turn_id text not null references turns(turn_id),
prompt text not null,
normalized_text text,
official_interpretation text,
last_message text not null,
token_count integer not null,
rule_id text,
status text not null check (status in ('draft', 'submitted')),
created_at timestamptz not null,
updated_at timestamptz not null
```

Recommended indexes:

```sql
CREATE INDEX conversation_drafts_wallet_updated_idx
  ON conversation_drafts (wallet, updated_at DESC);
```

### `jobs`

Job records may be stored in `verification_jobs` initially or split into a generic `jobs` table during implementation.

```sql
job_id text primary key,
job_type text not null,
status text not null,
idempotency_key text unique not null,
payload jsonb not null,
attempt_count integer not null default 0,
max_attempts integer not null,
run_after timestamptz not null,
locked_at timestamptz,
completed_at timestamptz,
failed_at timestamptz,
last_error_code text
```

### `audit_logs`

Compiler validation and deterministic guess verification both append audit records. The API keeps the canonical storage contract in `M3_7_POSTGRES_AUDIT_SCHEMA`; each row stores input/output hashes, a hash-chain commitment, and a public-state reference that links the log to either a rule validation record or a guess verification result.

```sql
log_id text primary key,
log_kind text not null,
turn_id text not null,
rule_id text,
player_wallet text,
job_id text,
validation_log_id text,
result_id text,
public_state_type text not null,
public_state_key text not null,
input_hash text not null,
output_hash text not null,
log_hash text not null unique,
previous_log_hash text,
commitment_hash text not null unique,
commitment_mechanism text not null,
reason text not null,
result text not null,
input_json jsonb not null,
output_json jsonb not null,
created_at timestamptz not null
```

## Creator Reward Accounting

`creator_reward_records` store calculated rewards from alternative-rule winner payouts. Winner-visible payouts are never reduced.

```sql
turn_id text not null,
active_rule_id text not null,
creator_wallet text not null,
winner_count integer not null,
individual_alt_payout_lamports numeric(20,0) not null,
reward_rate_bps integer not null,
calculated_reward_lamports numeric(20,0) not null,
available_reserve_lamports numeric(20,0) not null,
cap_per_turn_lamports numeric(20,0) not null,
final_reward_lamports numeric(20,0) not null,
was_capped boolean not null,
status text not null
```

Creator rewards are funded first from the creator reward reserve sourced from platform monetization. The reward basis is `15%` of the individual alternative-rule winner payout for each alternative-rule winner, subject to the per-turn creator cap and available reserve.

## Voter Reward Accounting

`voter_reward_records` store rewards for wallets that voted for the elected active rule. Voter rewards are funded only after creator reward funding from the remaining creator reward reserve, and winner-visible payouts are never reduced.

```sql
turn_id text not null,
active_rule_id text not null,
voter_wallet text not null,
voter_count integer not null,
individual_alt_payout_lamports numeric(20,0) not null,
reward_rate_bps integer not null,
reward_pool_lamports numeric(20,0) not null,
final_reward_lamports numeric(20,0) not null,
status text not null,
calculated_at timestamptz not null,
primary key (turn_id, active_rule_id, voter_wallet)
```

The voter reward pool is `15%` of a single individual alternative-rule winner payout, capped by `VOTER_REWARD_CONFIG.capPerTurnLamports`, then split equally across distinct wallets with recorded votes for the elected rule. If the elected rule has no recorded voters or the active rule produces no alternative-rule winners, no voter reward records are claimable.

## Claim Records

`claim_records` store claimable winner payouts, creator rewards, and elected-rule voter rewards. The local API projection models the wallet approval lifecycle before on-chain transfer instructions are enabled by later mainnet gates.

```sql
claim_id text primary key,
turn_id text not null,
wallet text not null,
claim_kind text not null check (claim_kind in ('winner_payout', 'creator_reward', 'voter_reward')),
category text check (category in ('original', 'alternative')),
active_rule_id text,
amount_lamports numeric(20,0) not null,
source_record_key text not null,
status text not null check (status in ('available', 'pending_wallet_approval', 'claimed', 'failed', 'unavailable')),
status_reason text not null,
available_at timestamptz not null,
claim_window_expires_at timestamptz not null,
claim_window_turns integer not null,
wallet_approval_state text not null,
wallet_approval_signature text,
wallet_approval_failure_reason text,
claimed_at timestamptz,
failed_at timestamptz,
created_at timestamptz not null,
updated_at timestamptz not null
```

Claims below the configured minimum threshold are created with `unavailable` status and `PAYOUT_BELOW_MINIMUM`. A claim must transition through `pending_wallet_approval` before it can become `claimed` or `failed`; a claimed record cannot be requested again.

## pgvector HNSW Migration

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE rule_registry_embeddings (
  embedding_id uuid primary key,
  rule_id text not null,
  turn_id text not null,
  embedding_model_version text not null,
  canonical_signature text,
  embedding_vector vector(1536) not null,
  created_at timestamptz not null
);

CREATE INDEX rule_registry_embedding_hnsw_idx
  ON rule_registry_embeddings
  USING hnsw (embedding_vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

Query sessions should set:

```sql
SET hnsw.ef_search = 40;
```
