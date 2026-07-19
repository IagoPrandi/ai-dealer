# Solana Programs

This Anchor workspace contains the updateable Idealer game program and the
separate Tokenomics Core program specified by `PRD-TOKENOMICS-v2.8.md`.

## Tokenomics Core

`programs/tokenomics_core` is a separate custody boundary with compile-time
placeholder program ID `CWA3N4ew4guFuY3P4jJTyt5HgidCRW6c7mGAL5pUSmb6`.
No matching keypair is stored in the repository. Replace it with the public
address of an externally managed deployment key before devnet or mainnet. The
initialization CPI creates canonical Metaplex metadata for `JUSDEALER` (`JDR`)
before mint/freeze authority revocation and binds metadata updates to the same
governance account as Tokenomics Core. It
implements:

- one-transaction 1B-token genesis allocation, classic SPL mint/freeze
  authority revocation, a 200M campaign vault, and immediate locking of the
  800M Creator Treasury Reserve;
- ordinary and treasury lock positions with confirmed-time event checkpoints,
  top-ups, and immediate canonical-destination unlocks;
- seven-turn distribution epochs, exact liabilities/dust/zero-weight rollover,
  optimistic roots, bonded challenges, replacement versions, permissionless
  sealing, perpetual fixed-destination Merkle claims, and positive correction
  epochs funded only by the correction reserve;
- deterministic campaign action, active-rule, voter-remainder, and referral
  reward arithmetic with exact terminal partial settlement;
- isolated future campaign vaults whose economic configuration freezes at
  funding;
- immediate on-chain treasury operations after the configured 2-of-3 multisig
  approval, bounded spending limits, a
  guardian-only pause, and multisig plus 24-hour-notice unpause.

`tools/tokenomics-calculator` is the independent Rust epoch calculator.
`packages/tokenomics` is the TypeScript implementation. Production root
publication must stop unless both outputs agree exactly. The shared vector is
`test-vectors/tokenomics-epoch-basic.json`.

The program remains upgradeable only for local development, audit, and devnet
rehearsal. Its upgrade authority must be revoked before any real-value mainnet
lock, fee deposit, campaign reward, or treasury funding.

The updateable Idealer game program is configured as the Core's
`game_authority` through its `global_config` PDA. It tracks each turn's exact
treasury share and can bridge a closed turn once into a collecting epoch. Its
CPI entry points bind proposal/supporter recipients to immutable game records,
bind active-rule settlement to the elected rule and fulfilled draw, require a
first-guess `GameToken` for referral qualification, and use idempotent
contribution PDAs for the first-round referral bonus.

## Implemented Core

- `GlobalConfig`, `TurnState`, `GameToken`, `PlayerGuess`, `RuleProposal`, sequenced `RuleVote`, `TreasuryVault`, and `PrizeVault`.
- `initialize_global_config`, `open_turn`, `submit_guess`, `propose_rule`, `vote_rule`, and `close_turn`.
- Isolated PDA constraints, checked fee accounting, turn lifecycle validation, and invalid-input tests.

## M3.1 — Verifiable Draw Flow

The draw uses a verifiable-randomness consumer pattern. Randomness is sourced
off-chain from a verifiable provider (Switchboard On-Demand) and consumed
on-chain; the program derives the published numbers deterministically so any
auditor can reproduce them.

- `request_draw(randomness_account)` — authority records the randomness account once a turn has ended (`DrawStatus::Requested`). Retryable from `NotRequested`/`Failed`.
- `settle_draw({ randomness, randomness_source })` — consumes the revealed 32-byte value (source must match the requested account), derives 6 unique numbers in `1..=100` via `domain::derive_draw_numbers`, and stores `draw_result`, `draw_randomness`, and `draw_vrf_fulfillment` (`DrawStatus::Fulfilled`).
- `fail_draw(failure_code)` — records a recoverable failure (`DrawStatus::Failed`) without corrupting turn/guess/rule/prize state.
- Derivation uses SHA-256 over `randomness | turn_id(u64 LE) | counter(u64 LE)` with rejection sampling (bytes `>= 200` skipped) for an unbiased `1..=100` mapping. The off-chain worker mirror in `apps/worker/src/draw.ts` is locked to the same known vectors by tests on both sides.

### SBF build, SBF tests, and devnet deploy

`scripts/sbf.sh` runs inside the pinned Rust container with Agave + `cargo-build-sbf` persisted in `idealer-solana-home`, the workspace, cargo registry cache, and `idealer-sbf-target` as `CARGO_TARGET_DIR`. Every invocation logs the active Agave/SBF versions. Tokenomics Core and Idealer are built as isolated deployables so Idealer's `tokenomics-core/cpi` dependency cannot disable the Tokenomics Core entrypoint through Cargo feature unification:

```bash
# from the repo root (PowerShell avoids MSYS path mangling)
docker run --rm -e CARGO_TARGET_DIR=/sbf-target \
  -v idealer-cargo-registry:/usr/local/cargo/registry \
  -v idealer-sbf-target:/sbf-target \
  -v idealer-solana-home:/root \
  -v "<repo>:/workspace" -w /workspace/contracts/solana \
  rust:1.91-bookworm bash /workspace/contracts/solana/scripts/sbf.sh <build|test-sbf|fund|deploy>
```

`deploy` defaults to the Idealer program and uses the deployer (and initial
upgrade-authority) keypair stored only in the `idealer-solana-home` volume.
Keypair contents are never printed or committed. Set
`DEPLOY_PROGRAM=tokenomics_core` and provide the externally managed
`tokenomics-core-program-keypair.json` in the same volume to deploy Tokenomics
Core. The helper fails unless that keypair public address matches the source
`declare_id!`.

After a verified Devnet Tokenomics Core deployment, transfer its upgrade
authority to the finalized Devnet Squads vault before genesis:

```bash
DEPLOY_PROGRAM=tokenomics_core \
NEW_UPGRADE_AUTHORITY=<DEVNET_SQUADS_VAULT_0> \
bash scripts/sbf.sh set-upgrade-authority
```

This command is a network write and must be run only after explicit transaction
review and approval. The genesis page at `/dev/tokenomics/genesis` remains
disabled until the program is executable, its upgrade authority is that vault,
the Idealer `GlobalConfig` PDA exists, all genesis PDAs are unused, and an
approved HTTPS metadata URI is configured.

## Local Validation

```bash
cargo check --workspace --all-targets --all-features --locked
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo test --workspace --all-targets --all-features --locked
```

Run these commands from `contracts/solana`.

On Windows, the package scripts run these checks in a pinned Linux Rust container because the Solana/Anchor toolchain requires WSL or Linux:

```bash
pnpm --filter @idealer/solana-programs typecheck
pnpm --filter @idealer/solana-programs lint
pnpm --filter @idealer/solana-programs test
```

The complete instruction suite requires Docker and the SBF toolchain. The helper builds an isolated `sb-devnet` artifact under `/sbf-target/test-deploy`, leaving the production-feature deploy artifact untouched, and then runs the ignored tests serially:

```bash
docker run --rm -e CARGO_TARGET_DIR=/sbf-target \
  -v idealer-cargo-registry:/usr/local/cargo/registry \
  -v idealer-sbf-target:/sbf-target \
  -v idealer-solana-home:/root \
  -v "<repo>:/workspace" -w /workspace/contracts/solana \
  rust:1.91-bookworm bash /workspace/contracts/solana/scripts/sbf.sh test-sbf
```

The SBF suite executes 8 Idealer scenarios covering initialization, turn opening, guess/Game Token creation, rule proposal, sequenced vote idempotency, VRF request/settlement, invalid-input rejection, turn closing, winner claims, and rejection of legacy creator/voter SOL claims. It also executes 2 Tokenomics Core scenarios covering one-time fixed-supply genesis and authority revocation, pause-safe canonical treasury unlock, epoch review and sealing, fixed-destination treasury claims, replay rejection, exact liability/dust accounting, and correction-epoch binding to an original sealed epoch. The build helper treats any compiler `Error:` diagnostic as fatal even if `cargo-build-sbf` exits successfully and removes disposable keypair files that `cargo-build-sbf` may generate beside the artifacts.

## Devnet Deployment Gate

Devnet deployment requires Solana CLI, Anchor CLI `0.32.1`, a separately managed deployment key, and funded devnet authority. Never commit or print the deployment key.

Current M2.2 devnet program id:

```text
6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4
```

Current M2.2 devnet deployer address to fund:

```text
4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH
```

The local keypairs for this M2.2 deploy attempt are stored outside the repository in the Docker `idealer-solana-home` volume under `/root/.config/idealer/devnet/`. Do not paste keypair JSON, seed phrases, or private keys into chat, commits, docs, or logs.

1. Fund the deployer address above on devnet. The latest deploy attempt required `2.95675416 SOL` plus a `0.00212 SOL` fee.
2. Run `cargo build-sbf --sbf-out-dir /tmp/idealer-deploy --jobs 1`.
3. Deploy with `solana program deploy /tmp/idealer-deploy/idealer.so --program-id /root/.config/idealer/devnet/idealer-program-keypair.json --keypair /root/.config/idealer/devnet/idealer-deployer-keypair.json --url devnet`.
4. Verify with `solana program show 6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4 --url devnet`.
5. Run cluster smoke tests before M2.3 UI integration.

See `security-checklist.md` before deployment.
