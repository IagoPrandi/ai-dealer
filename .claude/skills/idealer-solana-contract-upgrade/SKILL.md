---
name: idealer-solana-contract-upgrade
description: Safely modify, build, test, deploy, extend ProgramData, or govern upgrades of Idealer Solana programs. Use for Rust/Anchor contract changes, SBF artifacts, devnet deployment, upgrade buffers, ProgramData capacity, upgrade authority, Squads proposals, migrations, and post-upgrade on-chain verification.
---

# Idealer Solana Contract Upgrade

Use this skill for any change that can alter an on-chain Idealer or Tokenomics
Core program. It is a strict release process, not permission to send a
transaction.

## Read first

Before acting, read:

1. `PRD.md` and `AGENTS.md`.
2. `contracts/solana/README.md` and the relevant program source/tests.
3. `PROGRESS_TRACKER.md` and the current `deployments/` entry.
4. `.claude/skills/idealer-test-and-verify/SKILL.md` and its devnet reference.
5. `.claude/skills/solana-dev/SKILL.md`; use its linked Solana guidance where
   relevant.

Read `references/onchain-upgrade-evidence.md` before preparing an artifact or
any network action.

## Non-negotiable controls

- Default to a source-only change. Never deploy, extend ProgramData, upload a
  buffer, transfer authority, create/approve/execute a Squads proposal, mint,
  or transfer assets without explicit user authorization for that exact action.
- Treat cluster, program ID, ProgramData, buffer, upgrade authority, vault,
  artifact SHA-256, byte delta, fee payer, estimated SOL, and token movement as
  independent facts to verify on-chain. Never infer one from a UI label or a
  previous transaction.
- Never request, print, commit, copy, or log a secret key, seed phrase, or
  keypair JSON. Use the approved read-only volume or a protected host path.
- Do not use a fallback artifact, substitute program ID, direct multisig
  shortcut, `skipPreflight`, or an unreviewed authority transfer to get past a
  failed check.
- Devnet members, vaults, identities, empty metadata URI exceptions, and
  artifacts are devnet-only. Mainnet needs a separate reviewed ceremony.

## Workflow

### 1. Define the release boundary

Classify the request before changing code:

| Request | Required path |
| --- | --- |
| Rust/client/test-only change | Implement and run local/SBF verification; stop before network actions. |
| New program deployment | Verify program keypair/`declare_id!`, funded payer, artifact, then deploy only with exact authorization. |
| Upgradeable program change | Build an immutable reviewed buffer; transfer buffer authority to Squads; create a zero-approval proposal; wait for member approvals and execution. |
| ProgramData too small | Make a separate governed extension proposal; execute and re-read capacity before uploading/reusing the upgrade buffer. |
| State/config migration | Treat as a separate, explicitly reviewed instruction/proposal after the binary upgrade. |

State the proposed scope and all expected writes. If a required fact is missing,
inspect it; do not guess.

### 2. Implement with migration discipline

- Preserve canonical PDA seeds, account discriminators, instruction layouts,
  authority checks, token program variant, and CPI account ordering unless the
  PRD explicitly changes them.
- For account-layout changes, write an explicit migration or backward-compatible
  decoder and tests for old/current layouts. Do not silently reinterpret bytes.
- Keep test-only behavior behind a Rust feature such as `devnet-test`; production
  code must fail closed.
- Update the operator/client path, IDL/types, durable event indexing, API
  projections, and runbooks when the contract change affects them.

### 3. Build the exact artifact

Run the relevant verification ladder. For a contract change this includes native
program tests, clippy for default and all features, an isolated SBF build, and
serial SBF instruction tests where applicable. Use the repository helper and
its pinned Docker toolchain; do not build a workspace artifact that can silently
select the wrong entrypoint.

Record the final `.so` path, byte length, SHA-256, active feature set, source
commit, and program ID. Assert `declare_id!` equals the deployed program
keypair's public address before proposing any upload.

### 4. Read live state and preflight

For the requested cluster, independently read and validate:

- executable program owner and ProgramData address;
- ProgramData upgrade authority and allocated capacity;
- program/buffer authority, owner, data length, and artifact hash;
- Squads multisig identity, members, permissions, threshold, vault index, and
  proposal status;
- fee payer balance, rent/extension cost, and the exact instruction sequence.

Simulate the exact signed transaction bytes. Surface the result before asking
for authorization: cluster, every write, hashes, addresses, bytes, SOL cost,
token movement (normally none), approvals/execution state, and what remains
unchanged.

### 5. Govern the write

After the user gives explicit authorization, perform only the authorized stage:

1. Extend ProgramData first if necessary; verify its final capacity.
2. Upload the reviewed buffer and verify its on-chain SHA-256.
3. Move buffer authority to the canonical Squads vault if authorized.
4. Create one proposal with zero approvals. Creation is not approval or
   execution.
5. Each independent member approves through its own wallet.
6. Execute only after the threshold is on-chain and the final transaction still
   matches the reviewed artifact and accounts.

Do not combine an upgrade with a migration, a token transfer, or a governance
configuration change unless the user explicitly reviewed that atomic scope.

### 6. Verify and hand off

Read back the finalized transaction and on-chain program; confirm `err: null`,
cluster, program ID, ProgramData capacity/authority, deployed artifact hash,
Squads proposal/votes/execution, and buffer closure or remaining authority.
Then reconcile relevant API, durable-indexer, and audit records. Re-run the
same operator path only when it is designed to prove idempotency; it must make
no additional write.

Update deployment records, the relevant runbook, `PROGRESS_TRACKER.md`, and
its Work Log. Mark a milestone only after the user explicitly confirms it.

## Required response format for a network-write request

Before broadcast, provide a compact approval block containing:

```text
Cluster: devnet | mainnet
Action: <one exact stage>
Program / ProgramData / buffer: <addresses>
Artifact: <path>, <byte length>, SHA-256 <hash>
Governance: <multisig>, vault <index/address>, threshold <n-of-m>
Writes: <ordered list>
Fee payer and estimated cost: <address>, <SOL + network fee>
Token movement: none | <exact amounts and recipients>
Simulation: passed | failed, <units/error>
Not included: <approval, execution, migration, token movement, etc.>
```

Wait for an unambiguous approval. After a broadcast, report signatures and
readback evidence; never call a proposal "upgraded" until execution and the
deployed-byte hash both verify.
