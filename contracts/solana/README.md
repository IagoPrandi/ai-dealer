# Solana Programs

This Anchor workspace contains the Idealer core devnet program introduced in M2.2.

## Implemented Core

- `GlobalConfig`, `TurnState`, `GameToken`, `PlayerGuess`, `RuleProposal`, `RuleVote`, `TreasuryVault`, and `PrizeVault`.
- `initialize_global_config`, `open_turn`, `submit_guess`, `propose_rule`, `vote_rule`, and `close_turn`.
- Isolated PDA constraints, checked fee accounting, turn lifecycle validation, and invalid-input tests.

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
