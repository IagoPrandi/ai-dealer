# Solana Programs

This Anchor workspace contains the Idealer core devnet program introduced in M2.2 and extended with the verifiable draw flow in M3.1.

## Implemented Core

- `GlobalConfig`, `TurnState`, `GameToken`, `PlayerGuess`, `RuleProposal`, `RuleVote`, `TreasuryVault`, and `PrizeVault`.
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

`scripts/sbf.sh` runs inside the pinned toolchain container (Agave + `cargo-build-sbf`) with the workspace, the `idealer-solana-home` volume (toolchain + deploy keypairs), the cargo registry cache, and `idealer-sbf-target` as `CARGO_TARGET_DIR`:

```bash
# from the repo root (PowerShell avoids MSYS path mangling)
docker run --rm -e CARGO_TARGET_DIR=/sbf-target \
  -v idealer-cargo-registry:/usr/local/cargo/registry \
  -v idealer-sbf-target:/sbf-target \
  -v idealer-solana-home:/root \
  -v "<repo>:/workspace" -w /workspace/contracts/solana \
  rust:1.91-bookworm bash /workspace/contracts/solana/scripts/sbf.sh <build|test-sbf|fund|deploy>
```

`deploy` performs an upgrade of program `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4` using the deployer (and upgrade authority) keypair stored only in the `idealer-solana-home` volume. Keypair contents are never printed or committed.

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

The complete instruction suite requires an authorized SBF build environment. Build the SBF artifact into a temporary directory, remove any automatically generated deploy keypair immediately, then run:

```bash
SBF_OUT_DIR=/absolute/path/to/temporary/deploy pnpm --filter @idealer/solana-programs test:sbf
```

The SBF suite executes initialization, turn opening, guess/Game Token creation, rule proposal, vote uniqueness, invalid-input rejection, and turn closing.

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
