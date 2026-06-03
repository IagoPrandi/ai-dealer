# Admin Metrics Dictionary

Admin metrics are insight-only. They must not be used to manipulate live outcomes.

| Metric | Definition | Dimensions |
|---|---|---|
| `activation.wallet_connected` | Wallet connections per window. | wallet_type, device_type |
| `activation.first_guess_submitted` | First successful guess per wallet. | wallet_type, turn_duration |
| `activation.first_vote_cast` | First vote per wallet. | turn_duration |
| `engagement.rules_proposed` | Rule proposal count. | turn_id, creator_wallet, turn_duration |
| `engagement.votes_cast` | Vote count. | turn_id, rule_id, turn_duration |
| `engagement.spectator_visits` | Visits without guess submission. | referrer, device_type |
| `retention.return_after_loss` | Wallet returns after losing previous turn. | turn_duration, wallet_type |
| `retention.return_after_near_miss` | Wallet returns after near-miss event. | near_miss_type |
| `creator.rules_elected` | Creator rules elected as active. | creator_wallet |
| `creator.reward_amount` | Final creator reward amount. | creator_wallet, turn_id |
| `economy.prize_pool_lamports` | Total turn pool before distribution. | turn_id, turn_duration |
| `economy.rollover_lamports` | Amount rolled over by category. | category, turn_id |
| `economy.creator_reward_reserve_ratio` | Creator reward reserve usage ratio. | turn_id |
| `compiler.success_rate` | Valid compilations divided by attempted compilations. | provider, model, turn_duration |
| `compiler.final_confidence_avg` | Average final compiler confidence. | provider, model |
| `compiler.rejection_reason_count` | Rejections by reason. | reason, provider |
| `runtime.timeout_count` | Rule runtime timeout count. | rule_id, runtime_version |
| `abuse.vote_concentration_score` | Concentration metric for votes per rule. | turn_id, rule_id |
| `abuse.rate_limit_events` | Rate limit rejections. | error_code, wallet, ip_hash |
| `ops.queue_lag_seconds` | Queue lag by job type. | job_type |
| `ops.dead_lettered_jobs` | Jobs moved to dead-letter state. | job_type, error_code |

Snapshots should be written to `metrics_snapshots` with `snapshot_type`, `window_start`, `window_end`, `dimensions`, and `values`.
