# Technical Contracts Index

This directory contains the `M0.4 - Technical Contracts` drafts. These contracts define boundaries between frontend, API, worker, AI compiler, database, and Solana programs.

## Contract Documents

- `docs/api-contracts.md`
- `docs/data-model-draft.md`
- `docs/queue-job-contracts.md`
- `docs/agent-schema-draft.md`
- `docs/smart-contract-account-instruction-draft.md`
- `docs/admin-metrics-dictionary.md`
- `docs/shared-error-codes.md`

## Contract Rules

- Public API paths are versioned under `/api/v1`.
- Financial and authorization source-of-truth rules must be enforced on-chain where applicable.
- Backend, worker, and database records are projections, orchestration records, and audit trails unless explicitly described as source-of-truth.
- Every async job must have an idempotency key, retry policy, timeout, and terminal failure state.
- Every compiler artifact must be hashable and versioned.
- Every user-facing rejection must use a shared error code.
