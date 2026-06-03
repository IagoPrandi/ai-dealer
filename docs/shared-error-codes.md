# Shared Error Codes

These error codes are shared across frontend, API, worker, and admin surfaces. API responses must use the envelope defined in `docs/api-contracts.md`.

| Code | HTTP | Meaning |
|---|---:|---|
| `BAD_REQUEST` | 400 | Request shape or content is invalid. |
| `UNAUTHORIZED` | 401 | Wallet/session authentication is missing or invalid. |
| `FORBIDDEN` | 403 | Caller is authenticated but not allowed to perform the action. |
| `NOT_FOUND` | 404 | Requested resource does not exist or is not visible to the caller. |
| `CONFLICT` | 409 | Request conflicts with current state or idempotency record. |
| `RATE_LIMITED` | 429 | Server-side rate limit exceeded. |
| `TURN_NOT_OPEN` | 409 | The current turn no longer accepts this action. |
| `GUESS_ALREADY_SUBMITTED` | 409 | Wallet already submitted a guess for this turn. |
| `GAME_TOKEN_REQUIRED` | 403 | Current-turn Game Token PDA is required. |
| `GAME_TOKEN_INVALID` | 403 | Game Token PDA does not match wallet, turn, or status. |
| `RULE_TOKEN_LIMIT_EXCEEDED` | 400 | Rule text exceeds `RULE_MAX_TOKENS`. |
| `RULE_PREFLIGHT_FAILED` | 422 | Rule preflight blocked submission. |
| `RULE_PREFLIGHT_TOKEN_INVALID` | 403 | Preflight token is missing, expired, mismatched, or invalid. |
| `RULE_DUPLICATE_BLOCKED` | 422 | Dedup gate blocked a same-turn or cooldown duplicate. |
| `RULE_UNSUPPORTED` | 422 | Rule cannot be compiled into supported DSL/AST. |
| `RULE_TOO_EASY` | 422 | Rule fails difficulty policy. |
| `RULE_ALWAYS_TRUE` | 422 | Rule appears to always produce winners. |
| `RULE_IMPOSSIBLE` | 422 | Rule cannot produce winners under valid inputs. |
| `RULE_STATE_INVALID` | 409 | Requested transition is not allowed by the rule state machine. |
| `VOTE_ALREADY_CAST` | 409 | Wallet already voted for this rule in this turn. |
| `VRF_NOT_FULFILLED` | 409 | Required Switchboard VRF fulfillment is not available. |
| `ARTIFACT_HASH_MISMATCH` | 409 | Frozen or selected artifact hash does not match committed artifact. |
| `PAYOUT_NOT_AVAILABLE` | 409 | Payout is not claimable yet. |
| `PAYOUT_BELOW_MINIMUM` | 409 | Payout is below the minimum claim threshold and rolls over. |
| `CLAIM_WINDOW_EXPIRED` | 409 | Claim window is closed and payout rolled over. |
| `INTERNAL_ERROR` | 500 | Unexpected server error. |
| `DEPENDENCY_UNAVAILABLE` | 503 | Required database, queue, RPC, VRF, or model provider is unavailable. |
