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
  approval, destination-bound periodic spending limits, multisig cancellation
  of an active limit with a public reason hash, a
  guardian-only pause, and multisig plus 24-hour-notice unpause.

The devnet operator surfaces are `/dev/tokenomics/treasury/request` and
`/dev/tokenomics/treasury/approve`. A request stores the exact destination,
operator, maximum lamports, period, and configuration hash in one zero-approval
Squads proposal. After two member approvals, execution activates the on-chain
limit; the operator may then transfer only to its fixed destination and within
the current period allowance. Cancellation is a separate Squads proposal and
remains available after activation. The approval surface also reads the
available Treasury SOL Vault balance, treasury locked JDR, and distribution fee
pool directly from canonical Tokenomics Core accounts. Creation and execution
fail closed unless the deployed Tokenomics Core prefix is the reviewed
`1,073,632`-byte direct-fee artifact with SHA-256
`6dda1d95164486684957e8dddf7209a07aa31f4712ec9a9257a29fe6b9544173`,
the remaining `19,528` ProgramData bytes are zero, and upgrade authority is
Squads vault `0`. This artifact was built with
`devnet-empty-metadata-uri,devnet-campaign-v2-migration` and deployed through
Squads proposal `16` at finalized slot `482984308` by Wallet-B transaction
`FNn5K6stbJ63kqK3RU86QeP2NRwyTvH43cE57hKD3nU76hc9JdeXzPBKp7WSU8XFrtUqyhNFchLYazeaqKNPe2M`.
Both Wallet A and Wallet B approved the exact stored upgrade. The consumed
buffer `wxZTULrkLpkz43CVfW4rojrrM5Ax9ENQ2qCXT2kFidU` is closed, its
`7,473,682,800` rent lamports returned to Wallet B, and upgrade authority
remains vault `0`.

`tools/tokenomics-calculator` is the independent Rust epoch calculator.
`packages/tokenomics` is the TypeScript implementation. Production root
publication must stop unless both outputs agree exactly. The shared vector is
`test-vectors/tokenomics-epoch-basic.json`.

The program remains upgradeable only for local development, audit, and devnet
rehearsal. Its upgrade authority must be revoked before any real-value mainnet
lock, fee deposit, campaign reward, or treasury funding.

The updateable Tyche game program is configured as the Core's
`game_authority` through its `global_config` PDA. In the direct-custody build,
every paid game action sends its treasury share immediately to Tokenomics
Core's canonical `distribution_vault`; Tyche tracks the exact per-turn amount
until `bridge_turn_treasury_fee` assigns that already-funded amount once to a
collecting epoch. Its
CPI entry points bind proposal/supporter recipients to immutable game records,
bind active-rule settlement to the elected rule and fulfilled draw, require a
first-guess `GameToken` for referral qualification, and use idempotent
contribution PDAs for the first-round referral bonus.

The current devnet Tyche binary was deployed through Squads proposal `17` at
finalized slot `482987312` by Wallet-B transaction
`47Q4KYvGPmFcNKARe799v8UTKp2D3dopKKCrZfgKfku74wDxhnSLFqE7TGHcm57h29Ke4ZMiXxLKVWbWkLR13FGX`.
Its `1,111,616`-byte programme prefix has SHA-256
`a1087ef9cb66c24c76aa07b078128b6144ca20134ba9ed0af464b330b9bc1620`;
the remaining `9,512` bytes of the `1,121,128`-byte ProgramData capacity are
zero. Full-capacity SHA-256 is
`534f5877d276b3e85626287096b6627654347ccbcb24ae28ca755d57f1b3ada8`.
Upgrade authority remains Squads vault `0`. This binary deployment does not by
itself run the separate legacy-fee migration, enable worker revenue automation,
or authorize any mainnet action.

The reviewed direct-custody artifact is `1,111,616` bytes with SHA-256
`a1087ef9cb66c24c76aa07b078128b6144ca20134ba9ed0af464b330b9bc1620` and
fits the extended ProgramData with `9,512` bytes remaining. Proposal `15`
executed the reviewed authority bridge, and finalized transaction
`21VYTSd5LKPm4wbxx1qpyjoSmR81Udp2wQcs73np37Mam99jqjSQtWZy3f5ygZw9FDN88xDnz6SwCeS1f2MHPt44`
atomically extended ProgramData by `65,536` bytes, funded exactly `456,130,560`
rent lamports (`0.45613056 SOL`), and returned authority to Squads vault `0`.
Wallet B subsequently published the exact artifact as buffer
`AcREERShsxdH8zzYCk15GM6TEpqLdFiFmGPiRjWUVh7S`. Its publication history has
`1,101` successful
transactions and zero failures: creation
`5NDeneM2fecSGNhkjZKkAG3w9LDmHpwBUNU9QAjAFJmq1ZrfgRHSv6hP54JpBMrjZ1LPrxGoJfQuVuoiLDBBJo3U`,
final write
`4rDQqWKmK4N9BrzZTpoGFb7DsqViosJKzdM78DnsLpgjznqZfi7hAMmGGidnp5T6oANe2wqFY5yu3sEwxBxxRgzF`,
and authority handoff
`3vMe7VFnuHkH6aZL6ZPzMJidRfF2MkHaeLT8LgFDVGSVU1J9MaTw5kfv9Gt6UPVVPGioXDPcVRAteTcjxCzyf5Er`.
Squads proposal `17`, PDA
`4LzUFYrzw11f2SCzE5AM5z5AC4ic6PDiENUiZuc7mgNZ`, stored exactly one loader
upgrade with Wallet B as spill recipient. Wallet A approved in
`VSAmd56AUA5z8aHtcbdh1uZHcqGZ1WncKLmoTSmjCLhPeENgxB42HLDU2QTyg5h5zBvFw3zHvKwMd5di1dqBLpj`;
Wallet B approved in
`2UuEg4QKYZbV6FzEZYBu5swC6nrFmUyUUHS9mJV1VRrW8uLtzm3qspwdQVAqvU6NtAozvtfcTamBftsov1tzRT45`
and executed the upgrade. The consumed buffer is closed and its exact
`7,738,051,440` rent lamports returned to Wallet B. Finalized byte-for-byte
readback matches the reviewed length and SHA-256. The custody migration remains
a separate governed stage and must be re-read before it is proposed.
`apps/web/src/solana/tycheProgramExtensionProposal.ts` prepares the exact
Squads authority bridge and the atomic Wallet-A extension plus authority return.
The `.env`-backed governance operator pins every stage of proposal `15`:

```powershell
pnpm --filter @tyche/worker devnet:tyche-extension-governance -- inspect
pnpm --filter @tyche/worker devnet:tyche-extension-governance -- propose
pnpm --filter @tyche/worker devnet:tyche-extension-governance -- approve-a
pnpm --filter @tyche/worker devnet:tyche-extension-governance -- approve-b
pnpm --filter @tyche/worker devnet:tyche-extension-governance -- status
pnpm --filter @tyche/worker devnet:tyche-extension-governance -- execute-bridge
pnpm --filter @tyche/worker devnet:tyche-extension-governance -- extend-return
```

Execution of the authority bridge and the atomic extension/authority return are
separate broadcast gates because the interval between them temporarily places
the ProgramData under Wallet A. The second transaction always includes both the
extension and authority return, so those two changes succeed or roll back
together.

## Direct Fee-Pool Custody

The reviewed rollout consolidates all holder-fee SOL in Tokenomics Core's
canonical distribution vault
`FbJ6EnyvRE6ro5sGnpGdc4qfVCa7ibDgYpjwchaGxiCj`. Paid guesses, rule proposals,
votes, elimination votes, and rule removals transfer their treasury share
directly to that account; no worker is required for custody. The revenue worker
still opens seven-turn epochs and reconciles each closed turn exactly once, but
that bridge is accounting-only and moves no SOL.

The devnet migration is intentionally one-shot and governed by Tyche's actual
ProgramData upgrade authority. It transfers the entire legacy spendable Tyche
TreasuryVault balance of `23,000,000` lamports to the distribution vault,
retains `18,000,000` lamports as the outstanding total of closed current-layout
turns `32-55`, and records the remaining `5,000,000` lamports as genesis
rollover in Tokenomics Core. It refuses partial, zero, replayed, noncanonical,
or under-backed migrations. The operator is:

```powershell
pnpm --filter @tyche/worker devnet:fee-pool-migration -- inspect
pnpm --filter @tyche/worker devnet:fee-pool-migration -- propose
$env:TYCHE_APPROVER_ENV='PRIVATE_KEY_WALLET_A'; pnpm --filter @tyche/worker devnet:fee-pool-migration -- approve
$env:TYCHE_APPROVER_ENV='PRIVATE_KEY_WALLET_B'; pnpm --filter @tyche/worker devnet:fee-pool-migration -- approve
pnpm --filter @tyche/worker devnet:fee-pool-migration -- status
pnpm --filter @tyche/worker devnet:fee-pool-migration -- execute
```

`propose` creates a zero-approval Squads proposal. `approve` loads only the
named ignored `.env` member key, while `execute` is pinned to Wallet A. Neither
prints secret material; both verify the exact stored instruction and live
devnet identities, and execution refuses to proceed below the 2-of-3 threshold.
The migration does not create or move JDR. The Tokenomics
Core artifact required by this rollout is `1,073,632` bytes with SHA-256
`6dda1d95164486684957e8dddf7209a07aa31f4712ec9a9257a29fe6b9544173`.

Devnet proposal `18`, proposal PDA
`HoJtVX5ShxZ43fjmyJfcbWtGbCSQ3iSj1SJCCyS4w2Jm` and vault-transaction PDA
`5UN3M4V3bD8gzewVd8bmqjY881GJK4wNg51zvxHVUoD7`, was created with zero
approvals in finalized transaction
`yLJgmPQYdenNPWuNMzEFu2vvpMTJxiu1Piyio8wRMSfcJ4f9pRQQUj84o1aLv1KGtm4nMkYGLthhnf4MM3V7EFJ`.
Strict readback confirms its sole instruction is the reviewed migration with
the exact `18,000,000` / `5,000,000` split. Wallet A approved in finalized
transaction
`2ZMgcCS8j2SUQGZ83KDokPFhNPkKX6jSU5qBDrNG2Bj2qsWqAXZXPxF3p2Zr3teimxHAZYe6TwJbeV81ypU8g713`,
and Wallet B approved in
`w4ULtcxfdSaWznH7RvAXmSTNzTHQmwLspAguGD3JL562V4z7dHfjFYb3KYi2b3QD1w2VLbxhyfi1Hx8xAaQhyEi`.
The initial execution attempt against the then-deployed Tyche artifact was not
broadcast: signed simulation failed with `UnbalancedInstruction` before send,
so no legacy SOL moved during that attempt.

The failure occurred because Tyche debited its programme-owned legacy vault and
credited the Tokenomics distribution vault before invoking
`record_legacy_fee_rollover`, but the child CPI did not include the debited
vault in its account set. The runtime therefore saw an unbalanced lamport sum at
the CPI boundary. The source fix supplies that vault as a remaining CPI account,
allowing the runtime to reconcile both sides without granting Tokenomics debit
authority. A new serial SBF scenario executes the complete `23,000,000`-lamport
migration, verifies the `18,000,000` / `5,000,000` accounting, and rejects
replay. The corrective Tyche artifact is `1,112,264` bytes, SHA-256
`247d2e582c21285b14633a77e1a0cf199055c94c5bc57a1ea6b61a7613283b12`,
built with `devnet-test,sb-devnet`; it fits current ProgramData with `8,864`
bytes remaining. Wallet B published it to devnet buffer
`3uDPkjbohqDncQY6yEVn1N8bXs5XnGaP4YbGcc531QvE`, locking
`7,742,561,520` rent lamports, and transferred buffer authority to Squads vault
`DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp`. Finalized readback matched the
reviewed hash and all `1,112,264` bytes; the buffer history contains `1,102`
successful transactions and no failures.

Corrective Squads proposal `19`, proposal PDA
`B6ikxFUbUCne1RNFpqxe1h1Cu3hpDoL24yb2LAt8g1RV` and vault-transaction PDA
`F1EJHzouHNhYEEFAESdAde9wmg9hqCEeMFochh3H4FxD`, stored only the canonical
loader upgrade with Wallet B as the buffer-rent spill recipient. Wallet A and
Wallet B approved, and Wallet B executed in finalized transaction
`3dcabx2tW9xLDAD6CvdLxt6XeKqAPrUKZPWwqR3kfmbSNyC3YV5kMaTLodwqcrUG4GTmjJGwwJawwVGZq3kh7TGb`
at slot `482998701`. Finalized ProgramData readback matches SHA-256
`247d2e582c21285b14633a77e1a0cf199055c94c5bc57a1ea6b61a7613283b12`
across all `1,112,264` reviewed bytes, with `8,864` zero-padding bytes, Squads
vault-0 authority, and the buffer closed. Proposal `18` now has the corrected
binary prerequisite. Wallet A re-simulated it successfully and executed it in
finalized transaction
`2tNXmw9MdJ9y42Y19rY2euAJLpUXjPWZvUtA9TNWw1PAE9DPasdgsnvqPLg3vCMevuSnyzJiowYDA8f8jd13WV7Q`
at slot `482999695`. Final readback reports proposal `18` as `Executed`, zero
spendable lamports left in the Tyche TreasuryVault, and `23,000,000` available
lamports in the Tokenomics distribution vault. Its accounting preserves
`18,000,000` attributed-unbridged lamports and records `5,000,000` as pending
rollover/deposited. The physical distribution account holds `24,064,880`
lamports: `23,000,000` available plus `1,064,880` rent. The transaction had no
SPL-token balance entries, so no JDR moved.

## Prize-Vault Solvency

Each turn owns its own `prize_vault` PDA and receives only that turn's fee
share, so a rolled-over pool used to be accounting-only: the destination turn
advertised the source turn's leftover while those lamports stayed in the source
vault, and a winner of a turn with rollover held a `Claim` its vault could not
pay (`claim_prize` failed with `InsufficientVaultBalance`). Two program rules now
keep a recorded claim payable:

- `record_claim` reserves the payout. `PrizeVault::total_collected_lamports` is
  the vault's _unreserved_ balance: recording subtracts from it and rejects a
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

## Founder Pass Accounting Core (FP1)

`programs/tyche/src/founder_pass.rs` implements milestone **FP1** of
[`PRD-FOUNDER-PASS-NFT.md`](../../PRD-FOUNDER-PASS-NFT.md). It is state and
governance only. **No benefit is implemented**: nothing here waives a Tyche
fee, moves a lamport, or pays JDR. Fee waivers are FP2 and the JDR boost is
FP3, and both are blocked until FP0 closes.

FP0 is still open, so PRD §14 applies — "unresolved decisions block their
dependent work; they do not silently select a default." Every open decision is
an explicit `Unset` variant or a zero sentinel, and the programme refuses to
activate while any of them remains unresolved. §4.2 is what makes this
milestone shippable ahead of the Magic Eden gate: "A failed Launchpad gate
blocks the sale, while platform-neutral usage accounting can still be
implemented."

### Accounts

- `FounderPassConfig` — PDA `["founder_pass_config"]`, 180 bytes. Stores the
  governed asset standard and programme id, canonical collection, campaign,
  supply-enforcement mode and commitment, activation boundary, the §14 policy
  selections, and the §3.2 allowances. Allowances, the active-turn window, and
  the 5,000 supply cap are pinned to their constants, so governance cannot
  widen a confirmed limit through this account.
- `FounderPassUsage` — PDA `["founder_pass_usage", asset]`, 87 bytes. Keyed by
  the **individual NFT asset address, never by a wallet**, so quotas belong to
  the pass and survive a transfer (§3.2). Holds only the lifetime
  vote/proposal/bet counters; the window is global, so there is no per-pass turn
  state.

Both accounts are new, so no existing bytes are reinterpreted. The seventeen new
`TycheError` variants are appended, so existing error codes keep their numbers.

#### The active-turn window

Owner decisions of 2026-09-20, in two steps: a set of 100 distinct turn IDs
became a window of 800 consecutive turns, and that window then became
**global** rather than per-pass.

There is one window for the whole collection —
`[activation_turn_id, activation_turn_id + FOUNDER_PASS_ACTIVE_TURN_WINDOW - 1]`
— anchored at the governed activation turn. `activation_turn_id` is write-once,
so disabling and re-enabling cannot shift the window under existing holders. No
player action opens, extends, renews, or resets it.

§6.2 asked for membership-safe storage because "a counter alone cannot prove
whether a previously used turn is being reused". A governed contiguous range
satisfies that more strongly than a per-pass set: eligibility is a comparison
against bounds no player can influence, and there is no per-pass turn state to
corrupt. That is why the account is 87 bytes rather than the 889 the sorted-set
model needed.

Two trades are product rules, not optimizations:

1. **The clock cannot be deferred.** Declining a benefit preserves quota but
   buys no time.
2. **Passes do not all get 800 usable turns.** Quotas are identical, but a pass
   delivered late in the window inherits only the remainder, which departs from
   the earlier "identical benefits regardless of purchase phase" wording. At a
   24-hour production turn the whole window is about 800 days.

#### Rent

Rent exemption is a **refundable Solana deposit, not a Tyche fee** — PRD §3.2
already places account rent outside Tyche action fees. Read from the live
mainnet `SysvarRent111…` (`lamports_per_byte_year = 5080`,
`exemption_threshold = 1.0`, over a 128-byte account overhead):

| Account | Bytes | Lamports | SOL | Paid by |
| --- | ---: | ---: | ---: | --- |
| `FounderPassConfig` | 180 | 1,564,640 | 0.00156464 | governance, once |
| `FounderPassUsage` | 87 | 1,092,200 | 0.00109220 | the asset owner, per pass |

At the 5,000-pass cap the usage deposits total about 5.5 SOL, all of it
holder-paid, so this is not a project cost. The window model cut the per-pass
deposit by about 79% versus the 889-byte sorted-set layout. Note that the
**program binary did not shrink**: `tyche.so` went 1,173,696 → 1,172,272 →
1,173,904 bytes across the two changes, because the write-once activation check
and its error offset the removed search and insert logic. The saving is rent,
not code size. These are cluster parameters: re-read the sysvar at launch
instead of trusting this table.

### Instructions

All four are gated on the programme upgrade authority through the same
`require_program_upgrade_authority` path as `set_vrf_config`.

- `initialize_founder_pass_config` — creates the config in its birth state:
  benefits disabled, asset standard `Unset`, every §14 decision unresolved. It
  deliberately takes no arguments, so a deployment cannot be born with a guessed
  standard, collection, or policy.
- `configure_founder_pass(args)` — records the governed resolution of the §14
  decisions as one complete, reviewable statement. Refused once benefits are
  enabled: §4.3 requires a governed migration that preserves every asset's used
  allowances, not a config overwrite.
- `set_founder_pass_activation({ enabled, paused, activation_turn_id })` —
  enabling requires `unresolved_decisions() == 0`. Pausing is always permitted
  and rewrites no historical usage.
- `initialize_founder_pass_usage` — creates the per-asset usage account for a
  verified pass. The signer must be the asset's current on-chain owner. The
  account is permanent, so a second call fails rather than resetting accrued
  usage.

### Asset verification

`verify_founder_pass_asset` dispatches on the governed standard. `Unset` is not
a standard and refuses everything. Metaplex Core is the §4.1 **provisional**
standard; there is no fallback variant and no acceptance of arbitrary metadata
URIs, because adopting another standard requires its own reviewed verifier.

The trust anchor is the account owner: bytes are interpreted only after the
account is proved to be owned by the governed Core programme id, so a forged
look-alike account owned by any other programme is rejected before a single
field is read. The verifier then checks the `AssetV1` key discriminator (which
a burned or uninitialized asset does not carry), the current owner against the
signer, the collection binding through `UpdateAuthority::Collection`, and the
plugin registry for a frozen `FreezeDelegate` or `PermanentFreezeDelegate`.
Name, symbol, image, and URI are skipped structurally and never used as
authorization input (§6.2). Every read is bounds-checked and fails closed.

> **FP-D2 gate.** The Core plugin-registry discriminants were written from the
> documented Metaplex Core layout and **must be re-verified against the exact
> deployed `mpl-core` build during the FP0 freeze**, before governance enables
> benefits. The decoder fails closed on any structural ambiguity and the whole
> path is unreachable while `enabled` is false, so an unverified numbering
> cannot authorize anything today.

### What FP2 and FP3 build on

`plan_founder_pass_use` takes the window from `FounderPassConfig::turn_window()`
and decides one pass use without writing: it validates the account's
representation invariant, checks the window before the action quota so an
out-of-window attempt reports the governing reason, and returns every post-state
counter. The caller writes those values. Because the planner is pure, a refusal
leaves the account untouched, satisfying "a failed or reverted action consumes
neither quota nor turn".

Three preconditions belong to the FP2/FP3 call sites, not to this module:

- An action already free under ordinary game policy must not reach the planner
  at all — §3.2 requires it to consume no quota.
- A JDR boost must pass its reward's **originating** turn, not the turn current
  at claim time (§3.3). A reward earned before activation is therefore not
  boostable.
- The player-facing auto-apply preference (FP4) is an off-chain profile setting
  that decides only whether the app prompts. Every transaction must still state
  explicitly whether it takes the pass-funded path; a preference can never widen
  what the programme authorizes.
- That last point is an open product question, recorded under FP-D6/FP-D7:
  attributing the boost to the originating turn existed to keep distinct-turn
  counting honest, and the window model removes that reason. FP3 should confirm
  whether the claim turn is the better attribution before it is built.

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

The SBF suite executes 11 Tyche scenarios covering initialization, direct fee-pool transfers for every paid action, turn opening, guess/Game Token creation, rule proposal, sequenced vote idempotency, VRF request/settlement, invalid-input rejection, turn closing, winner claims, and rejection of legacy creator/voter SOL claims. It also executes 5 Tokenomics Core scenarios covering one-time fixed-supply genesis and authority revocation, one-shot backed legacy-fee rollover, pause-safe canonical treasury unlock, epoch review and sealing, fixed-destination treasury claims, replay rejection, exact liability/dust accounting, and correction-epoch binding to an original sealed epoch. The build helper treats any compiler `Error:` diagnostic as fatal even if `cargo-build-sbf` exits successfully and removes disposable keypair files that `cargo-build-sbf` may generate beside the artifacts.

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
