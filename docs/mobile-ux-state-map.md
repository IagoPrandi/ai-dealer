# Mobile UX State Map

This state map defines required UX states for M0.5 and the implementation contract for the M1 mobile prototype.

## Route And Navigation States

| State | Trigger | Primary action | Secondary actions | Exit condition |
|---|---|---|---|---|
| `PLAY_LOADING` | `/play` opens before data is loaded. | None. | None. | Current turn response resolves. |
| `PLAY_READY_FIRST_TIME` | No wallet session is present. | Connect wallet. | View public rules, view previous results. | Wallet connection succeeds. |
| `PLAY_READY_RETURNING` | Wallet session is restored. | Contextual next action. | Rules, results, history. | User starts an action. |
| `PLAY_NO_ACTIVE_TURN` | API reports no open turn. | Refresh. | View history. | New turn opens. |
| `PLAY_DELAYED` | Turn exists but draw, election, or verification is delayed. | View audit. | Refresh status. | Delayed dependency resolves. |
| `PLAY_FAILED` | API or chain state cannot be loaded. | Retry. | View status. | Data loads or user leaves. |

## Wallet And Transaction States

| State | Trigger | User feedback | Recovery |
|---|---|---|---|
| `WALLET_DISCONNECTED` | No wallet connection. | Action requires wallet. | Connect wallet. |
| `WALLET_CONNECTING` | Wallet modal or deep link opened. | Preserve DApp state. | Return to previous step on cancel. |
| `WALLET_CONNECTED` | Wallet returns approved session. | Show truncated wallet and current permissions. | Disconnect or continue. |
| `TX_AWAITING_APPROVAL` | Wallet transaction approval opened. | Show action and estimated cost in DApp before leaving. | Cancel returns to review. |
| `TX_PENDING_CONFIRMATION` | Transaction submitted but not finalized. | Lock submitted payload and show progress. | Poll status. |
| `TX_CONFIRMED` | Chain confirms transaction. | Show success and next available action. | Advance flow. |
| `TX_REJECTED` | User rejects in wallet. | Show non-punitive rejected state. | Return to editable review. |
| `TX_FAILED` | Transaction fails or expires. | Show normalized error code and retry. | Retry or edit payload. |

## Number Selection States

| State | Condition | UI behavior |
|---|---|---|
| `NUMBER_EMPTY` | No numbers selected. | Review disabled, helper text visible. |
| `NUMBER_PARTIAL` | 1 to 5 numbers selected. | Sticky selected tray visible, review disabled. |
| `NUMBER_READY` | Exactly 6 unique numbers selected. | Review enabled. |
| `NUMBER_DUPLICATE_ATTEMPT` | User taps an already selected number. | Keep stable layout and show selected state. |
| `NUMBER_SUBMITTED` | Guess transaction confirmed. | Lock guess for current turn and show Game Token issued. |

## Rule Proposal States

| State | Condition | UI behavior |
|---|---|---|
| `RULE_DRAFT_EMPTY` | Rule text empty. | Submit disabled. |
| `RULE_DRAFT_VALID_LENGTH` | Token count is 1 to 64. | Neutral counter. |
| `RULE_DRAFT_WARNING_LENGTH` | Token count is 65 to 80. | Warning counter and concise editing guidance. |
| `RULE_DRAFT_REJECTED_LENGTH` | Token count exceeds 80. | Submit disabled with `RULE_TOKEN_LIMIT_EXCEEDED`. |
| `RULE_PREFLIGHT_PENDING` | Preflight request in progress. | Disable submit, preserve text. |
| `RULE_PREFLIGHT_PASSED` | Gates pass and preflight token is returned. | Enable proposal transaction approval. |
| `RULE_PREFLIGHT_REJECTED` | Dedup, unsupported, too easy, always true, or impossible gate fails. | Show specific shared error code and preserve text. |
| `RULE_PROPOSAL_PENDING` | Proposal transaction is pending. | Show proposed text and pending status. |
| `RULE_PROPOSED` | Proposal transaction confirmed. | Show compilation status and audit link. |

## Voting States

| State | Condition | UI behavior |
|---|---|---|
| `VOTE_LOCKED_NO_TOKEN` | Wallet lacks current-turn Game Token. | Prompt user to submit guess first. |
| `VOTE_AVAILABLE` | Game Token exists and rule is eligible. | Vote buttons enabled. |
| `VOTE_PENDING` | Vote transaction pending. | Disable duplicate vote submission. |
| `VOTE_CONFIRMED` | Vote transaction confirmed. | Show selected vote and updated count. |
| `VOTE_CHANGED` | Contract/API allows changed vote for same turn. | Show latest selected rule. |
| `VOTE_CLOSED` | Election has closed. | Show read-only rule ranking. |

## Rule Of The Hour States

| State | Condition | UI behavior |
|---|---|---|
| `RULE_LEADING` | Election open and rule is currently leading. | Show provisional language. |
| `RULE_FINALIST` | Rule is in finalist set. | Show finalist badge and audit link. |
| `RULE_ACTIVE` | Rule is elected and frozen. | Show active Rule of the Hour. |
| `RULE_EXPIRED` | Turn completed. | Move rule to result history. |
| `RULE_UNAVAILABLE` | No eligible rule exists. | Explain original rule still applies and alternative bucket follows rollover policy. |

## Draw, Result, And Reward States

| State | Condition | UI behavior |
|---|---|---|
| `DRAW_PENDING` | Guess window closed, VRF pending. | Show delayed-safe status and audit link. |
| `VERIFYING_RESULTS` | Draw exists, verification running. | Show stable verification progress. |
| `RESULT_NO_WIN` | User has no payout. | Show drawn numbers and near-miss feedback when applicable. |
| `RESULT_ORIGINAL_WIN` | User wins original bucket. | Show payout available or pending. |
| `RESULT_ALTERNATIVE_WIN` | User wins alternative bucket. | Show active rule result and payout state. |
| `RESULT_NEAR_MISS` | User is close but not a winner. | Show non-financial near-miss label. |
| `CREATOR_REWARD_PENDING` | User created active rule and reward calculation is pending. | Show creator reward status without reducing winner-visible payouts. |
| `CREATOR_REWARD_AVAILABLE` | Creator reward is claimable. | Show amount, cap note, and claim availability. |
| `PAYOUT_AVAILABLE` | Claimable payout exists. | Show amount and claim action. |
| `PAYOUT_UNAVAILABLE` | No claimable payout exists. | Show reason from shared error code or result state. |

## Share Card States

| State | Trigger | Content |
|---|---|---|
| `SHARE_READY` | Result state loaded. | Turn id, drawn numbers, near-miss label, active rule title, and public URL. |
| `SHARE_GENERATING` | User taps share. | Stable preview placeholder. |
| `SHARE_FAILED` | Generation or native share fails. | Retry and copy-link fallback. |
| `SHARE_COMPLETE` | Native share or copy succeeds. | Inline success feedback. |

## Critical UX Rules

- No critical action may depend on desktop-only layout.
- Wallet interruptions must resume the exact originating step.
- Loading, empty, failed, delayed, rejected, pending, and confirmed states must have distinct copy and controls.
- All rejection states must use shared error codes from `docs/shared-error-codes.md`.
- Financial status must distinguish player payouts from creator rewards.
- Creator rewards are funded from the monetization-backed creator reward reserve and must not reduce winner-visible payouts.
