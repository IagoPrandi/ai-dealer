# Solana Programs

This Anchor workspace contains the updateable Tyche game program and the
separate Tokenomics Core program specified by `PRD-TOKENOMICS-v2.8.md`.

## Tokenomics Core

`programs/tokenomics_core` is a separate custody boundary. Its externally
managed devnet program identity is
`BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm`; the keypair is stored only in
the external `tyche-solana-home` volume and is never committed. This address
is devnet-only and does not select a mainnet program identity. The programme
was deployed at finalized devnet slot `477455064` by transaction
`2CFWENLszmB7YJH8D6q2BjGeUEPL5o7XuM2dkEbg2SQmeD2EHFtfWs8BsUytqykrTAr27iyhMHXgJYtKVPF6kT5k`.
The downloaded on-chain bytes match the reviewed deployment artifact at
SHA-256 `b1cfc5f0a1bd69d28eb191e24bf2f0f3c24811d5f29b7f2e175bddd80bb0cc8c`.
Finalized devnet transaction
`5h3eiWKtkuNWxXQXQE1z4FsMeVwVvQfHdTwo3hFsrmQtgKWo9jTRhSPrZmcTqBjqPk35MqyB5LgC373Ya221DSKh`
transferred its upgrade authority from the initial deployer to Squads vault
`0`, `DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp`, at slot `477456584`.
Future upgrades therefore require the configured Squads `2-of-3` execution
path. Genesis remains disabled until all other preflight gates pass. The
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

The updateable Tyche game program is configured as the Core's
`game_authority` through its `global_config` PDA. It tracks each turn's exact
treasury share and can bridge a closed turn once into a collecting epoch. Its
CPI entry points bind proposal/supporter recipients to immutable game records,
bind active-rule settlement to the elected rule and fulfilled draw, require a
first-guess `GameToken` for referral qualification, and use idempotent
contribution PDAs for the first-round referral bonus.

The current devnet Tyche binary was deployed through Squads proposal `13` at
finalized slot `482717873` by transaction
`Xq64Rk66MYpAR2gNky82kQSsjbe9FukcCZShoTDPEyAk5HXZS6Qy5F9aY4vrwHWvLs32FuNSnxWpbvUEXAApxyF`.
Its `1,050,944`-byte programme prefix has SHA-256
`2e1ea292f31d618c90f7959c7614a76c44fbc3967b950df19b07073dd510fe89`;
the remaining `4,648` bytes of ProgramData capacity are zero. Upgrade
authority remains Squads vault `0`, and the consumed buffer
`6y7SSzgjXmLYNagJJKGBsuRB721twDGgfNUUPQz1mc1s` is closed. This
binary deployment does not by itself enable worker revenue automation or
authorize any mainnet action.

That `4,648`-byte headroom is the binding constraint on the next Tyche upgrade:
a larger artifact needs a separate governed ProgramData extension executed and
re-read **before** the upgrade buffer is proposed. `scripts/extend-tyche-programdata.cjs`
prepares that extension, and note that the loader enforces a minimum growth of
`10,240` bytes per extension.

## Prize-Vault Solvency

Each turn owns its own `prize_vault` PDA and receives only that turn's fee
share, so a rolled-over pool used to be accounting-only: the destination turn
advertised the source turn's leftover while those lamports stayed in the source
vault, and a winner of a turn with rollover held a `Claim` its vault could not
pay (`claim_prize` failed with `InsufficientVaultBalance`). Two program rules now
keep a recorded claim payable:

- `record_claim` reserves the payout. `PrizeVault::total_collected_lamports` is
  the vault's *unreserved* balance: recording subtracts from it and rejects a
  payout larger than what is left (`ClaimExceedsPrizeVault`), so an
  over-computed off-chain amount fails at settlement instead of in a winner's
  wallet. `claim_prize` only moves lamports, clamping the counter to what the
  account can still back so vaults written before this rule self-heal.
- `sweep_prize_rollover` moves a closed turn's whole unreserved balance into the
  open turn's vault and accumulates the declared split into the destination
  `TurnState`. The declared halves must sum to exactly the source vault's
  unreserved balance (`RolloverAmountMismatch`), which makes the instruction
  self-reconciling and replay-safe, and the source vault's free lamports must
  equal that same balance (`PrizeVaultHasOutstandingClaims`), so a turn that
  still owes a payout cannot have that money carried away from its winner.
- `expire_claim` releases a payout whose claim window has closed, moving its
  reservation back into the vault's unreserved balance and marking the claim
  `ClaimState::Expired` (terminal — `claim_prize` requires `Available`). The
  window closes when EITHER `CLAIM_WINDOW_TURNS` turns have started since the
  claim's turn or `CLAIM_WINDOW_SECONDS` have passed since it was recorded,
  whichever comes first (PRD §8.7.7); inside the window the programme refuses
  with `ClaimWindowStillOpen`. Without this an abandoned payout would pin its
  lamports forever and — because a vault that owes a claim may not be swept —
  block every later rollover out of that turn.

The worker runs both immediately after a turn opens, from the automation loop
and from manual turn control: it releases the previous turn's expired payouts
first, then sweeps, so an abandoned claim cannot stall the rollover chain.

## Implemented Core

- `GlobalConfig`, `TurnState`, `GameToken`, `PlayerGuess`, `RuleProposal`, sequenced `RuleVote`, `TreasuryVault`, and `PrizeVault`.
- `initialize_global_config`, `open_turn`, `submit_guess`, `propose_rule`, `vote_rule`, and `close_turn`.
- Isolated PDA constraints, checked fee accounting, turn lifecycle validation, and invalid-input tests.

## M3.1 — Verifiable Draw Flow

The draw uses a verifiable-randomness consumer pattern. Randomness is sourced
off-chain from a configured verifiable provider and consumed on-chain; the
program derives the published numbers deterministically so any auditor can
reproduce them. ORAO v2 is the primary devnet continuation provider and
Switchboard On-Demand remains compatible.

- `request_draw(randomness_account)` — authority records the randomness account once a turn has ended (`DrawStatus::Requested`). An ORAO v2 request must be created in the same transaction and cannot be failed/reset after recording; the Switchboard path retains its prior retry behavior.
- `settle_draw({ randomness, randomness_source })` — consumes the revealed 32-byte value (source must match the requested account), derives 6 unique numbers in `1..=100` via `domain::derive_draw_numbers`, and stores `draw_result`, `draw_randomness`, and `draw_vrf_fulfillment` (`DrawStatus::Fulfilled`).
- `fail_draw(failure_code)` — records a recoverable Switchboard failure (`DrawStatus::Failed`) without corrupting turn/guess/rule/prize state; persistent ORAO requests reject this instruction to prevent abort-and-reroll bias.
- Derivation uses SHA-256 over `randomness | turn_id(u64 LE) | counter(u64 LE)` with rejection sampling (bytes `>= 200` skipped) for an unbiased `1..=100` mapping. The off-chain worker mirror in `apps/worker/src/draw.ts` is locked to the same known vectors by tests on both sides.

The existing `draw_vrf_config` and `election_vrf_config` fields select ORAO
only when set to its canonical Network State PDA
`5ER1oENnV4srxYdAynUfRzWeQCPQaqMiAp4VqyMbSqnK`; every other value continues
to be interpreted as a Switchboard queue. The ORAO programme is hardcoded as
`VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y`. Tyche accepts only v2
request PDAs owned by that programme, bound to the Tyche authority as client,
and rejects pre-fulfilled requests. Fulfilled 64-byte ORAO values are SHA-256
compressed to the existing 32-byte protocol input.

### SBF build, SBF tests, and devnet deploy

`scripts/sbf.sh` runs inside the pinned Rust container with Agave + `cargo-build-sbf` persisted in `tyche-solana-home`, the workspace, cargo registry cache, and `tyche-sbf-target` as `CARGO_TARGET_DIR`. Every invocation logs the active Agave/SBF versions. Tokenomics Core and Tyche are built as isolated deployables so Tyche's `tokenomics-core/cpi` dependency cannot disable the Tokenomics Core entrypoint through Cargo feature unification:

```bash
# from the repo root (PowerShell avoids MSYS path mangling)
docker run --rm -e CARGO_TARGET_DIR=/sbf-target \
  -v tyche-cargo-registry:/usr/local/cargo/registry \
  -v tyche-sbf-target:/sbf-target \
  -v tyche-solana-home:/root \
  -v "<repo>:/workspace" -w /workspace/contracts/solana \
  rust:1.91-bookworm bash /workspace/contracts/solana/scripts/sbf.sh <build|test-sbf|fund|deploy>
```

`deploy` defaults to the Tyche program and uses the deployer (and initial
upgrade-authority) keypair stored only in the `tyche-solana-home` volume.
Keypair contents are never printed or committed. Set
`DEPLOY_PROGRAM=tokenomics_core` and provide the externally managed
`tokenomics-core-program-keypair.json` in the same volume to deploy Tokenomics
Core. The helper fails unless that keypair public address matches the source
`declare_id!`.

The owner-approved devnet rehearsal creates canonical on-chain Metaplex
metadata with `JUSDEALER`, `JDR`, and an intentionally empty off-chain URI.
Build that upgrade artifact in an isolated output directory with both the
explicit devnet feature and the approved devnet programme identity:

```bash
SBF_OUT_DIR=/sbf-target/devnet-tokenomics-upgrade \
TOKENOMICS_SBF_FEATURES=devnet-empty-metadata-uri \
bash scripts/sbf.sh build
```

The feature alone is insufficient: Tokenomics Core also compares its compiled
programme identity with `BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm`.
Builds without the feature, or builds using a separate mainnet identity, reject
an empty URI. Before mainnet, publish and review durable HTTPS JSON metadata,
select the separate mainnet metadata governance/mutability policy, build
without `devnet-empty-metadata-uri`, and verify that an empty or non-HTTPS URI
fails before any genesis transaction is proposed.

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
the Tyche `GlobalConfig` PDA exists, all genesis PDAs are unused, and the
metadata input matches the devnet-only policy. An empty devnet URI is not
permission to omit the canonical Metadata account and does not satisfy the
future mainnet metadata gate.

## Local Validation

```bash
cargo check --workspace --all-targets --all-features --locked
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo test --workspace --all-targets --all-features --locked
```

Run these commands from `contracts/solana`.

On Windows, the package scripts run these checks in a pinned Linux Rust container because the Solana/Anchor toolchain requires WSL or Linux:

```bash
pnpm --filter @tyche/solana-programs typecheck
pnpm --filter @tyche/solana-programs lint
pnpm --filter @tyche/solana-programs test
```

The complete instruction suite requires Docker and the SBF toolchain. The helper builds isolated `sb-devnet` Tyche and `devnet-empty-metadata-uri` Tokenomics Core artifacts under `/sbf-target/test-deploy`, leaving the production-feature deploy artifact untouched, and then runs the ignored tests serially:

```bash
docker run --rm -e CARGO_TARGET_DIR=/sbf-target \
  -v tyche-cargo-registry:/usr/local/cargo/registry \
  -v tyche-sbf-target:/sbf-target \
  -v tyche-solana-home:/root \
  -v "<repo>:/workspace" -w /workspace/contracts/solana \
  rust:1.91-bookworm bash /workspace/contracts/solana/scripts/sbf.sh test-sbf
```

The SBF suite executes 8 Tyche scenarios covering initialization, turn opening, guess/Game Token creation, rule proposal, sequenced vote idempotency, VRF request/settlement, invalid-input rejection, turn closing, winner claims, and rejection of legacy creator/voter SOL claims. It also executes 2 Tokenomics Core scenarios covering one-time fixed-supply genesis and authority revocation, pause-safe canonical treasury unlock, epoch review and sealing, fixed-destination treasury claims, replay rejection, exact liability/dust accounting, and correction-epoch binding to an original sealed epoch. The build helper treats any compiler `Error:` diagnostic as fatal even if `cargo-build-sbf` exits successfully and removes disposable keypair files that `cargo-build-sbf` may generate beside the artifacts.

## Devnet Deployment Gate

Devnet deployment requires Solana CLI, Anchor CLI `0.32.1`, a separately managed deployment key, and funded devnet authority. Never commit or print the deployment key.

Historical M2.2 devnet program id:

```text
6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4
```

Historical M2.2 devnet deployer address to fund:

```text
4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH
```

The local keypairs for this M2.2 deploy attempt are stored outside the repository in the Docker `tyche-solana-home` volume under `/root/.config/tyche/devnet/`. Do not paste keypair JSON, seed phrases, or private keys into chat, commits, docs, or logs.

1. Fund the deployer address above on devnet. The latest deploy attempt required `2.95675416 SOL` plus a `0.00212 SOL` fee.
2. Run `cargo build-sbf --sbf-out-dir /tmp/tyche-deploy --jobs 1`.
3. Deploy with `solana program deploy /tmp/tyche-deploy/tyche.so --program-id /root/.config/tyche/devnet/tyche-program-keypair.json --keypair /root/.config/tyche/devnet/tyche-deployer-keypair.json --url devnet`.
4. Verify with `solana program show 6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4 --url devnet`.
5. Run cluster smoke tests before M2.3 UI integration.

See `security-checklist.md` before deployment.
