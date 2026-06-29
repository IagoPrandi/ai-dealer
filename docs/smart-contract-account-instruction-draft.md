# Smart Contract Account and Instruction Draft

This is the Solana account and instruction contract draft for M0.4. Program implementation is deferred to later milestones.

## Account Model

| Account | PDA Seeds | Purpose |
|---|---|---|
| `GlobalConfig` | `[b"global_config"]` | Protocol parameters, treasury, VRF config, fee config, pause state. |
| `TurnState` | `[b"turn", turn_id]` | Turn timing, pool, draw, election, rollover, and state machine data. |
| `GameToken` | `[b"game_token", turn_id, player_wallet]` | Turn-scoped participation credential issued by `submit_guess`. |
| `PlayerGuess` | `[b"guess", turn_id, player_wallet]` | One guess per wallet per turn. |
| `RuleProposal` | `[b"rule", turn_id, rule_id]` | Rule text, hashes, token count, state, vote/report counts. |
| `RuleVote` | `[b"vote", turn_id, rule_id, voter_wallet, sequence]` | Sequenced vote record per wallet/rule/turn; same wallet may cast repeated votes with escalating fees. |
| `RuleRemovalRecord` | `[b"remove_rule", turn_id, rule_id, remover_wallet]` | Paid rule removal audit. |
| `ElectionVrfRequestRecord` | `[b"election_vrf", turn_id]` | Switchboard election request and fulfillment reference. |
| `RuleFinalistSetRecord` | `[b"finalists", turn_id]` | Locked finalist set and hashes. |
| `CompiledRuleArtifactRecord` | `[b"compiled_artifact", rule_id, artifact_hash]` | Hash pointer and version metadata for frozen artifact. |
| `VerificationRecord` | `[b"verification", turn_id, player_wallet]` | Original and alternative rule verification result. |
| `PayoutRecord` | `[b"payout", turn_id, player_wallet, category]` | Claimable payout or rollover status. |
| `CreatorRewardRecord` | `[b"creator_reward", turn_id, active_rule_id]` | Active-rule creator reward record. |
| `TreasuryVault` | `[b"treasury_vault"]` | Treasury funds. |
| `PrizeVault` | `[b"prize_vault", turn_id]` | Turn prize funds. |

## Game Token Validation Contract

Game Token PDA seeds:

```text
[b"game_token", turn_id, player_wallet]
```

Instructions that require a current-turn Game Token must verify:

- PDA derivation matches `turn_id` and `player_wallet`.
- Token status is active.
- Token was issued by `submit_guess`.
- Token belongs to the same turn as the requested action.
- Token counters/sequence state price the requested action; paid play/create/vote actions have no fixed protocol cap.

## Instruction List

| Instruction | Access | Required Checks |
|---|---|---|
| `initialize_global_config` | Authority | Initializes fees, VRF config, turn cycle, legacy config fields, treasury. |
| `open_turn` | Authority/automation | Previous turn finalized or first turn; cycle index valid. |
| `submit_guess` | Player | Turn open, valid six unique numbers, sequence valid, fee paid; first successful guess creates `GameToken`. |
| `propose_rule` | Player | Game Token valid, token count valid, preflight commitment valid, proposal fee paid. |
| `vote_rule` | Player | Game Token valid, rule proposed/eligible, sequence valid and unique for that wallet/rule/turn, repeated-vote fee paid when required. |
| `remove_rule` | Player | Game Token valid, removal threshold passed, removal fee paid to prize pool, before eligible pool lock. |
| `report_rule` | Player/API commitment | Game Token valid, report rate limit observed off-chain. |
| `lock_eligible_rule_pool` | Automation | Election cutoff reached, eligible pool hash committed. |
| `request_election_vrf` | Automation | Eligible pool locked, Switchboard request recorded. |
| `fulfill_election_vrf` | Switchboard/automation | Fulfillment verified, random finalists derived from fulfilled randomness. |
| `freeze_active_rule` | Automation | Elected artifact hash matches cached precompiled artifact. |
| `request_draw_vrf` | Automation | Guess cutoff reached, draw request recorded. |
| `submit_draw_result` | Switchboard/automation | Fulfillment verified, six unique numbers in range. |
| `submit_verification` | Automation | Runtime artifact hash matches frozen artifact; results idempotent. |
| `create_payout_record` | Automation | Payout buckets, rollover, minimum threshold, and creator rewards reconcile. |
| `claim_payout` | Player | Claim window open, amount above threshold, not already claimed. |
| `claim_creator_reward` | Creator | Reward finalized, cap/reserve applied, not already claimed. |
| `rollover_unclaimed` | Automation | Claim window expired. |
| `pause_protocol` | Emergency authority | Emits audit event and blocks critical state changes. |
| `resume_protocol` | Emergency authority | Emits audit event after incident resolution. |

## Emitted Events

- `TurnOpened`
- `GuessSubmitted`
- `GameTokenIssued`
- `RuleProposed`
- `RuleVoteCast`
- `RuleRemoved`
- `EligibleRulePoolLocked`
- `RuleFinalistSetCreated`
- `RuleElected`
- `RuleFrozen`
- `DrawCompleted`
- `VerificationCompleted`
- `PayoutAvailable`
- `CreatorRewardAvailable`
- `PayoutClaimed`
- `ProtocolPaused`
- `ProtocolResumed`

Events must include enough fields for indexers to reconstruct public state without reading private off-chain logs.
