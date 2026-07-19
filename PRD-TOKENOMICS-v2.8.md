# Idealer — Fixed-Supply Tokenomics and Promotion PRD

> **Version:** 2.8-draft
> **Status:** Draft — core economic, custody, immediate multisig treasury execution, immutable tokenomics-core, optimistic epoch settlement, challenge-liveness, correction-reserve, campaign-vault, referral, claim-destination, and terminal-reserve rules confirmed; metadata, legal, and launch records remain pending
> **Last updated:** 2026-07-18
> **Scope order:** Tokenomics first; promotional use second.

## 1. Purpose

Introduce a single, fixed-supply Idealer token that is the **only entitlement
mechanism** for a user to claim treasury-fee distributions. The token must also
fund the initial player-promotion programmes without ever increasing the total
supply.

This document supersedes the former 400,000,000-token proposal. It does not
authorise an implementation or a mainnet launch until the decisions in
[Section 10](#10-decision-register) are confirmed.

### 1.1 Normative scope and relationship to the main game PRD

This document is the normative source for the Idealer SPL token, fixed supply,
locking, treasury-fee distributions, campaign-token rewards, referrals,
treasury custody, and treasury movement controls. The main game PRD remains
normative for turns, game fees, prize pools, rule election, AI compilation, and
winner settlement.

Where an older main-PRD clause conflicts with this document on tokenomics, this
document supersedes that clause until the aligned main PRD is adopted. In
particular, obsolete statements that Idealer uses only native SOL, that no SPL
token is required, that first actions remain free through turn 100, or that
creator/voter rewards are paid from SOL platform monetisation are not binding.
The aligned main PRD must reproduce the current rules rather than rely only on
this precedence clause.

**Terminology alignment.** In this document and the main game PRD, "turn" and
"round" denote the same game cadence unit and are used interchangeably; every
occurrence of "round" in this document means one game turn. An **epoch** is a
distinct, larger accounting unit equal to exactly seven completed turns
(Section 4.4). The referral "first-round bonus" is scoped to the invitee's first
game turn.

**Free-action window is environment-configured.** The turn index at which the
first-action free window ends
(`freeActionWindowEndsBeforeTurnIndex`, main PRD §8.2) is **30 in
production/mainnet** and **100 in development/staging/devnet** while the project
is being built and tested. Where this document states the window as "rounds 1
through 30", that is the production value; development environments keep the
window open through turn 100 until the production cutover.

## 2. Product Principles and Non-Goals

### 2.1 Principles

- The supply is minted exactly once: **1,000,000,000 tokens**.
- No account, multisig, programme upgrade, or governance vote may mint another
  token after genesis.
- A user must lock tokens to participate in treasury-fee distributions.
- Distribution is proportional to both the user's locked quantity and the time
  for which that quantity was locked, relative to all eligible locked-token
  time in the same accounting period.
- Unlocking tokens stops new reward accrual for those tokens. It does not burn
  the tokens.
- Promotional rewards are capped by a dedicated reserve and cannot reduce a
  player's game prize or a previously accrued treasury-fee entitlement.
- All user-facing DApp copy for this feature must be UTF-8 English.

### 2.2 Non-goals

- The token does not grant an automatic right to game prizes, rule selection,
  or an ownership interest in Idealer.
- The project does not prescribe or depend on how holders use unlocked tokens
  outside the official protocol functions. Holders may transfer, hold, integrate,
  or voluntarily burn their tokens at their own discretion. External uses do not
  create obligations, guarantees, or supported utilities for Idealer.
- Treasury-fee claims do not require burning tokens. A voluntary holder burn is
  irreversible and simply removes those tokens from future locking eligibility.
- The first version does not use real-time per-transfer accounting. Claims use
  closed accounting epochs so that transfers remain compatible with normal SPL
  token infrastructure.

## 3. Token Specification

| Property | Requirement |
| --- | --- |
| Token standard | Plain SPL Token; Token-2022 extensions are out of scope for v1. |
| Total supply | `1,000,000,000` whole tokens; fixed forever. |
| Decimals | `9`; fixed for genesis and all atom-based accounting. |
| Issuance | One genesis transaction mints the complete supply to auditable allocation vaults. |
| Mint authority | Revoked (`None`) immediately after the genesis mint. |
| Freeze authority | `None`; no party can freeze a holder's account. |
| Transferability | Transferable while unlocked; tokens in the locking escrow cannot be transferred until unlocked. |
| Metadata | Canonical Metaplex metadata is created atomically during genesis before mint-authority revocation. Name: `JUSDEALER`; symbol: `JDR`; seller fee: `0`. The approved HTTPS metadata URI remains pending. On devnet, metadata remains mutable only through Squads vault `0` `DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp`; mainnet metadata authority and mutability remain a separate launch decision. |

### 3.1 Supply invariant

```text
genesis_minted = 1,000,000,000 tokens
mint_authority = None
future_minted = 0
total_supply <= 1,000,000,000 tokens forever
```

The programme must verify the expected mint and token programme on every token
instruction. Its tests must prove that every attempted post-genesis mint fails.

### 3.2 Genesis allocation

The confirmed genesis allocation is:

| Allocation | Tokens | Share | Status |
| --- | ---: | ---: | --- |
| Initial Campaign Reserve Vault | 200,000,000 | 20% | Prefunded at genesis in a dedicated programme-controlled SPL token vault; funds the initial promotion until exhaustion and does not participate in treasury-fee distributions while reserved. |
| Creator Treasury Reserve | 800,000,000 | 80% | Productive treasury capital. The complete allocation is locked after genesis validation and remains available for later partial unlocks and approved uses under Section 3.3. |
| Total | 1,000,000,000 | 100% | Fixed. |

The complete 1 billion must still be minted at genesis. Moving tokens from an
existing allocation is not minting, but must not silently bypass an approved
allocation policy.

### 3.3 Creator Treasury Reserve custody

The 800M allocation is minted into a dedicated SPL token account named
`Creator Treasury Reserve Vault`. After the mint, vault, and allocation checks
complete and the mint authority is revoked, the entire 800M allocation is
immediately locked into the programme-controlled `Treasury Lock Escrow`. The
multisig remains the beneficial owner of the corresponding `LockPosition` and
the only governance authority permitted to authorise a lock or unlock.

The multisig is not the direct transfer authority of either treasury vault. The
`Creator Treasury Reserve Vault` and `Treasury SOL Vault` are technically
controlled by the `TreasuryPolicyExecutor` PDA, whose governance authority is
the active treasury multisig. This prevents threshold signatures from bypassing
the on-chain movement policy. While tokens are locked, the locking-program PDA
is the escrow authority. No account may be owned directly by an individual
wallet, application server, or programme upgrade authority. Custody evolves
through the following confirmed stages.

#### 3.3.1 Devnet rehearsal custody: founder-controlled `2-of-3`

During the devnet rehearsal, the treasury uses a founder-controlled `2-of-3`
multisig. These addresses and the resulting Squads accounts are **devnet-only**.
They must not be reused, copied, or inferred as the mainnet custody set. Mainnet
members require a separate custody approval before genesis:

- all three signer wallets are initially owned and controlled by the founder;
- each signer uses a different device or hardware wallet;
- each signer has an independently generated seed phrase;
- seed backups are stored in separate physical locations and must not share a
  common cloud backup, password vault, browser profile, or daily-use device;
- any two of the three signer wallets can approve a multisig action;
- one lost or compromised signer is insufficient to move the reserve, while the
  two remaining signers preserve recoverability.

This stage is **single-owner multi-key custody**, not independent multiparty
governance. The founder controls enough keys to meet the threshold and therefore
retains unilateral economic control. Public disclosures must describe it that
way.

The owner supplied these devnet-only member public addresses. They are members,
not a multisig or vault PDA and not private keys:

| Member | Public address | Device, backup, and recovery record |
| --- | --- | --- |
| A | `EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea` | Devnet only; operated through Phantom; pending device/recovery record. |
| B | `EAoZrh8TtZCYtUdKpkuMaNSrConsQoUQvzjZ7cuQGqdW` | Devnet only; pending device/recovery record. |
| C | `7E3DMct5umGMA4mSeAr1UcJUFSd5kd444rK39G8GTC9p` | Devnet only; pending device/recovery record. |

Phantom is the approved wallet application for member A during this devnet
ceremony. This identifies the transaction-signing client only; it does not
complete the required device, seed-backup, or recovery record and does not
authorize Phantom or any application server to access the private key.

The selected devnet provider is **Squads Protocol v4**, program
`SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`. The multisig must be created
with all three members holding initiate, vote, and execute permissions,
threshold `2`, `time_lock = 0`, no unilateral configuration authority, and no
spending limit at creation. The multisig account is a Squads-owned PDA. Vault
index `0` is derived from that multisig account and is the PDA that executes
approved Tokenomics Core governance instructions. The finalized devnet creation
transaction `4TzMqySK4kdpcYb1ojTEzYyoCiibq8wrDkUMGdmNx2iXvTF2PLCXqUAbE7S1spLsV1o7XqLCRsZRnm9uJN8N3kAx`
created multisig `DQmcXBdLsQUVsk8UmgnTdnjruRHnAquuFP9wPa87T5RD`; its derived
vault index `0` is `DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp`. The vault PDA
is correctly derived but has no allocated account or balance until it receives
an asset. These are devnet rehearsal addresses only. The previously supplied
`iV6DGgtL79buLCvhUEFYiTyAaE4teT6utweVTaqoXFa` value is explicitly rejected and
must not be used as either address.

The web application exposes a devnet-only creation ceremony at
`/dev/tokenomics/multisig`. It accepts only Phantom connected to member A,
checks the RPC genesis hash against Solana devnet, generates the required
one-time Squads create signer only in browser memory, derives multisig and vault
index `0`, and displays the exact provider treasury, creation fee, estimated
rent, fee payer, members, permissions, threshold, and time lock before enabling
the signing action. After Phantom signs, the application verifies signatures
while simulating the exact signed bytes; it broadcasts only after a successful
simulation, waits for finalization, then reads the multisig back and rejects any
owner, member, permission, threshold, time-lock, config-authority, or
rent-collector mismatch. Preparing or opening the page cannot submit a
transaction.

#### 3.3.2 Planned transition to `3-of-5`

The same multisig may later be expanded by adding two new members and changing
the threshold from `2-of-3` to `3-of-5`:

```text
Initial: 2-of-3
A, B, C -> founder-controlled independent wallets

Expanded: 3-of-5
A, B, C -> founder-controlled independent wallets
D, E    -> wallets independently created and controlled by the new members
```

The transition requirements are:

1. each new member creates and controls their own wallet and provides only its
   public address; private keys and seed phrases must never be transferred;
2. the current `2-of-3` threshold approves the configuration transactions that
   add D and E;
3. D and E must each complete a test proposal, approval, and signature flow
   before the threshold is raised;
4. the threshold is then changed to `3-of-5`;
5. member additions, threshold changes, test transactions, and final
   configuration are published in the treasury audit record.

If the multisig provider supports an atomic member-and-threshold update, the
transition should use it. Otherwise, members are added and tested before the
threshold is increased. At no intermediate state may the threshold exceed the
number of operationally available signers.

After expansion, the founder still controls A, B, and C and can therefore meet
the `3-of-5` threshold alone. D and E add recovery, visibility, and additional
approval paths, but do not remove the founder's unilateral control. A future
decentralisation decision may replace one or more founder-controlled signers
with independently controlled member wallets; this is optional and requires a
separately approved custody amendment.

#### 3.3.3 Treasury operation approval and immediate execution policy

All treasury movements remain subject to the active `2-of-3` multisig
threshold. The owner has explicitly set the Tokenomics Core execution delay to
**zero seconds**: once the multisig approves and submits a valid operation, it
is executable immediately. This applies to discretionary outbound treasury
movements and treasury policy changes. It does not alter the independent
24-hour root-review window, 48-hour challenge-resolution deadline, or 24-hour
unpause notice.

The following protocol-settlement and internal-custody operations are also
immediate:

- a sealed holder claim from the token-lock distribution vault to the
  beneficiary encoded in the Merkle leaf;
- the treasury position's sealed claim from the same distribution vault to the
  fixed `Treasury SOL Vault` beneficiary;
- locking treasury tokens from the canonical `Creator Treasury Reserve Vault`
  into the canonical `Treasury Lock Escrow`;
- unlocking treasury tokens from the canonical `Treasury Lock Escrow` back to
  the canonical `Creator Treasury Reserve Vault`;
- ordinary-holder lock and unlock operations under the same protocol rules.

These operations remain subject to their own authentication, state, Merkle,
beneficiary, and canonical-destination checks. For treasury lock and unlock, the
active multisig threshold must authorise the instruction, but execution is
immediate once that valid instruction is confirmed.

The active multisig threshold applies to **discretionary outbound movements or
changes that can redirect treasury property**, including:

- transferring SOL from the `Treasury SOL Vault` to an `Operating Wallet`,
  vendor, remuneration wallet, investment account, or other external
  destination, except for transfers already permitted by a previously approved
  on-chain spending limit;
- transferring tokens from the `Creator Treasury Reserve Vault` to a campaign,
  liquidity, sale, pledge, lending, grant, or other external-purpose vault or
  recipient;
- changing members, threshold, treasury-vault authority, programme authority,
  allowed destinations, spending limits, or treasury movement permissions;
- any other operation that moves treasury assets outside the canonical reserve
  vault, canonical lock escrow, or fixed claim destination defined by this PRD.

A spending limit is itself established or changed only after the multisig
threshold. Once active, transfers that satisfy its amount, period, asset, and
destination constraints do not require a new approval for every routine payment.

The same treasury multisig governs the `TreasuryPolicyExecutor`, which is
the technical authority of the `Creator Treasury Reserve Vault` and the
`Treasury SOL Vault`. Discretionary outbound execution must pass through this
on-chain executor, which:

- records the approved transaction and `execute_after` timestamp;
- records an `execute_after` timestamp equal to approval time because the
  configured delay is zero;
- prevents threshold signatures from using a parallel direct-transfer path;
- preserves the approved asset, destination, amount, and purpose hash at
  execution.

Public records must show the multisig, vaults, members by role, proposal,
approvals, immediate execution eligibility, permitted destination, and execution transaction. An
emergency process may pause future campaign distributions or unexecuted
operations where technically possible, but may not bypass the active threshold
for discretionary outbound movements. Initial signer addresses,
device separation, backup locations by role, and the recovery procedure are
operational launch records and must be documented before genesis.

### 3.3.4 Reserve-vault, lock-escrow, and custody-perimeter separation

The treasury custody path uses two distinct token accounts, one SOL vault, one
logical lock record, and one common treasury governance authority:

| Component | Technical authority / governance | Function |
| --- | --- | --- |
| `Creator Treasury Reserve Vault` | SPL authority: `TreasuryPolicyExecutor` PDA; governance authority: active treasury multisig | Holds unlocked treasury tokens and receives every treasury unlock. The multisig has no parallel direct-transfer path. |
| `Treasury Lock Escrow` | Locking-program PDA | Holds treasury tokens while they accrue locked-token-seconds; can release them only through validated lock-program instructions to the canonical reserve vault. |
| Treasury `LockPosition` | Programme state; `beneficial_owner = treasury_multisig_vault` | Records amount, intervals, fixed claim beneficiary, and the multisig as the only treasury lock/unlock authority. |
| `Treasury SOL Vault` | Lamport/SOL authority: `TreasuryPolicyExecutor` PDA; governance authority: the same active treasury multisig | Receives only the treasury position's sealed SOL claims and holds treasury-owned SOL before approved use. The multisig has no parallel direct-transfer path. |

The required internal token-custody path is:

```text
Creator Treasury Reserve Vault --multisig-authorised immediate lock--> Treasury Lock Escrow
Treasury Lock Escrow --multisig-authorised immediate unlock--> Creator Treasury Reserve Vault
```

Neither leg has an execution delay or an additional unbonding period. They are
canonical internal movements: the lock escrow cannot choose another source or
return destination, and the tokens remain treasury property throughout.

An unlock may never choose an arbitrary recipient. The programme must return
unlocked treasury tokens only to the canonical `Creator Treasury Reserve Vault`
bound in `TokenConfig` and in the treasury `LockPosition`. A future campaign,
sale, liquidity operation, pledge, remuneration transfer, operating allocation,
or other external use occurs only after the asset is in the relevant treasury
vault and the separately scheduled discretionary outbound transaction has
received the active multisig threshold approval or satisfies a previously
approved on-chain spending limit.

The token-lock distribution vault is outside this discretionary treasury
movement path. It is a protocol settlement pool holding amounts owed to all
sealed beneficiaries. Claims from that pool are executed under Section 4.4 and
are never delayed by treasury-operation approval.

### 3.4 Creator Treasury Reserve lock participation

The full 800M Creator Treasury Reserve is locked after the genesis mint,
allocation-vault verification, and mint-authority revocation. The initial state
is therefore:

```text
Creator Treasury Reserve Vault = 0 unlocked treasury tokens
Treasury Lock Escrow = 800,000,000 locked treasury tokens
```

The full 800M Creator Treasury Reserve is eligible to lock and claim treasury
fees. It is productive protocol capital used to support Idealer operations, not
an excluded or passive allocation. Its `LockPosition` uses exactly the same
locked-token-seconds formula, epoch rules, and immediate-unlock semantics as
every other holder. It receives no multiplier, priority, or private fee route.

The treasury position differs only in authority and fixed destinations:

- `beneficial_owner` and `unlock_request_authority` are the published treasury
  multisig vault;
- locked tokens are held by the programme PDA in `Treasury Lock Escrow`;
- every unlock returns tokens only to the canonical `TreasuryPolicyExecutor`-controlled
  `Creator Treasury Reserve Vault` governed by the multisig;
- the Merkle leaf for the treasury position binds its SOL beneficiary to the
  published `Treasury SOL Vault`;
- a claim caller cannot redirect either the SOL entitlement or the locked
  tokens.

When the entire reserve is locked for the same time as the rest of supply, it
has 80% of the time-weighted claim entitlement. If fewer than 200M tokens are
locked outside the Creator Treasury Reserve, its share is higher. This outcome
must be shown plainly in public tokenomics, epoch accounting, and the creator
treasury dashboard before users lock tokens.

Treasury lock and unlock instructions require the active multisig threshold but
have no execution delay: they move tokens only between the canonical
`Creator Treasury Reserve Vault` and `Treasury Lock Escrow`, with no arbitrary
recipient and no additional unbonding period. A routine treasury-fee claim also
requires no multisig approval and does not unlock or transfer the 800M tokens. It may be
initiated by the founder, an authorised keeper, or any caller when implemented
as a permissionless claim. The claim instruction reads the beneficiary from the
sealed Merkle leaf and therefore pays the treasury position only to the
`Treasury SOL Vault`. A later discretionary outbound use of assets held by a
treasury-controlled vault requires the active multisig threshold as defined in
Section 3.3.3.

Claimed SOL becomes treasury property only after it reaches the `Treasury SOL
Vault`. Moving it from that vault to an operating wallet or another
discretionary destination requires the active multisig threshold, unless the
transfer is within a previously approved on-chain spending limit. The fee-pool
claim and the later treasury withdrawal
must be separate instructions, separate state transitions, and separate audit
events.

The locked reserve is therefore productive treasury capital: its time-weighted
share of treasury-fee distributions creates recurring operating cash flow
without requiring the reserve tokens themselves to be sold or consumed.
Creators and operators may participate through the same holder rules with their
personal tokens, but the 800M reserve remains treasury property under multisig
custody.

### 3.5 Treasury operating cash-flow

The ordinary operating flow is:

```text
800M locked in Treasury Lock Escrow
-> time-weighted treasury-fee entitlement
-> epoch sealed
-> fixed-destination claim
-> Treasury SOL Vault
-> approved operating allocation
-> Operating Wallet
-> project costs
```

Operational requirements:

- claiming a sealed entitlement must never change the lock position or require
  selling reserve tokens;
- the `Treasury SOL Vault` is the only beneficiary of the reserve's claims;
- the daily operating wallet must be separate from all multisig signer wallets;
- the operating wallet holds only a bounded budget rather than the full treasury
  balance;
- the founder may administer the operating wallet and execute expenses within
  an approved budget or spending limit;
- establishing or increasing the operating limit, changing its destination,
  or transferring above it requires the active multisig threshold;
- every claim, operating allocation, and expense reconciliation must be
  publicly auditable at the treasury level, without publishing private vendor
  or personal data.

### 3.6 Promotional reserve vault architecture

The 200M initial promotion allocation must be separated from the 800M Creator
Treasury Reserve at genesis. It is held in a dedicated SPL token account named
`Initial Campaign Reserve Vault`, whose transfer authority is a campaign-program
PDA rather than the founder, an application server, a multisig signer wallet, or
the general treasury vault.

The genesis flow is:

```text
1,000,000,000 tokens minted once
├── 200,000,000 -> Initial Campaign Reserve Vault
└── 800,000,000 -> Creator Treasury Reserve Vault
                         └── after genesis validation and mint-authority revocation
                             -> multisig-authorised immediate lock
                             -> Treasury Lock Escrow
```

The initial campaign vault requirements are:

- its balance is prefunded at genesis and can never be replenished by minting;
- its tokens remain liquid inside the vault so the programme can settle eligible
  rewards; they are not placed in the treasury locking escrow;
- while held by the campaign vault, the 200M tokens accumulate no
  locked-token-seconds and have no entitlement to treasury-fee distributions;
- ordinary transfers are possible only through programme instructions that
  prove an eligible action or outcome, calculate the deterministic reward, and
  atomically debit the remaining campaign balance;
- the founder and multisig do not manually approve individual rewards;
- the campaign programme cannot debit the 800M Creator Treasury Reserve, the
  prize vault, the Treasury SOL Vault, or another campaign vault;
- pausing future settlement or changing campaign configuration requires the
  authorised emergency/configuration path, but no authority may revoke rewards
  already settled or redirect previously committed balances;
- the vault address, token mint, programme authority, original allocation,
  current balance, cumulative issuance, and all transfers are public.

Each future promotion must receive a disclosed tranche of existing tokens in a
new, campaign-specific vault. Campaign balances must never be pooled in a single
general-purpose operating account. The movement path is:

```text
Creator Treasury Lock Escrow
-> approved tranche unlock
-> Creator Treasury Reserve Vault
-> active multisig threshold + immediate execution
-> Future Campaign Vault N
-> programme-controlled reward settlement
```

A future campaign configuration may be edited only while its state is `DRAFT`.
Funding is the freeze boundary: before any tranche enters the vault, the
configuration must identify the allocation, reward formulas, eligibility rules,
start condition, stop condition, expiry if any, settlement programme, terminal
partial-payment rule, and unused-balance policy. Once funded, those economic
fields are immutable. Only a predeclared pause/resume control may remain
operational. Any material economic change requires a new campaign ID, new
configuration, new vault, and new multisig approval.
Unless a funded campaign explicitly defines another approved rule, unused tokens
remain in the same campaign vault and cannot be spent by another campaign.

## 4. Treasury-Fee Locking and Claiming

### 4.1 Fee source

One hundred percent of the defined treasury-fee portion of paid game actions
funds this programme. Prize-pool funds remain outside it. Active-rule creator
and elected-rule voter rewards are denominated in Idealer tokens and paid from
an approved campaign reserve, not deducted in SOL from the treasury-fee
distribution vault. There is no treasury-operations remainder before the
locker distribution: project operations are financed from the SOL claimed by
the locked Creator Treasury Reserve and from other separately approved treasury
assets.

Each fee split must record, on-chain and in public accounting:

```text
gross action fee
-> prize-pool share
-> treasury-fee share
-> 100% of the treasury-fee share to the token-lock distribution vault
```

No administrative withdrawal may take assets already sealed for a distribution
epoch.

#### 4.1.1 Distribution pool is not a treasury spending vault

The token-lock distribution vault is a protocol settlement pool, not the
`Treasury SOL Vault` and not an operating treasury account. SOL deposited there
remains governed by epoch accounting and sealed claim liabilities until it is
paid to the leaf-bound beneficiary or classified as rollover under Section 4.4.

Therefore:

- no treasury multisig proposal is required for a valid holder claim;
- no treasury-operation approval applies between the distribution vault and an ordinary
  holder beneficiary;
- no treasury-operation approval applies between the distribution vault and the fixed
  `Treasury SOL Vault` beneficiary of the 800M treasury position;
- the treasury cannot spend, redirect, borrow, or withdraw SOL directly from the
  distribution vault;
- treasury spending controls begin only after the treasury position's claim has
  settled into the `Treasury SOL Vault`.

### 4.2 Locking model

A holder locks an amount of tokens by transferring them into a
programme-controlled escrow linked to a `LockPosition`. Each position records at
least:

- beneficial owner and token mint;
- canonical unlocked-token return vault or wallet;
- fixed SOL claim beneficiary;
- locked amount;
- lock start timestamp;
- last accrued timestamp or epoch checkpoint;
- authority permitted to request a partial or full unlock.

For an ordinary holder, the beneficial owner, unlock authority, unlocked-token
recipient, and SOL claim beneficiary are bound to that holder's wallet unless a
separately supported delegated-custody flow is explicitly implemented. For the
800M treasury position, the beneficial owner and unlock authority are the
treasury multisig vault, unlocked tokens return only to the `Creator Treasury
Reserve Vault`, and SOL claims pay only the `Treasury SOL Vault`.

Tokens begin earning only after the lock transaction is confirmed. Backdating,
retroactive eligibility, and off-chain-only balance assertions are forbidden.
The programme PDA, not the holder or multisig, is the token-account authority
for assets currently held in a locking escrow.

### 4.3 Time-weighted proportional distribution

The v1 accounting unit is **locked-token seconds**. For a wallet or beneficial
position `w` in a closed epoch `e`:

```text
weight(w, e) = Σ [locked_amount during each interval × interval_seconds]
total_weight(e) = Σ weight(w, e)
```

When `total_weight(e) > 0`:

```text
raw_claim(w, e) =
  gross_distributable(e) × weight(w, e) / total_weight(e)

merkle_claim(w, e) = floor_to_lamports(raw_claim(w, e))
```

This means a holder who locks twice as many tokens for the same eligible period
has twice the weight; a holder who locks the same amount for twice as long has
twice the weight. New locks accrue from their confirmation time only. Partial
unlocks preserve the accrued weight up to the unlock timestamp and accrue no
new weight after it.

#### 4.3.1 Epoch with zero total weight

If `total_weight(e) = 0`, the epoch creates no claim leaves and no claimable
liability. One hundred percent of its `gross_distributable(e)` becomes
`zero_weight_rollover_out(e)` and is carried into the next epoch:

```text
total_weight(e) = 0
sum_of_merkle_claims(e) = 0
zero_weight_rollover_out(e) = gross_distributable(e)
epoch_status = ROLLED_OVER_NO_WEIGHT
```

No wallet, treasury, operator, or programme authority may claim or withdraw this
amount before it is included in a later epoch with positive total weight.

### 4.4 Epoch accounting, Merkle-root lifecycle, claims, and rounding

An epoch is exactly seven completed turns and may be calculated only after the
seventh turn has settled and the relevant on-chain events are finalised.

#### 4.4.1 Exact epoch accounting

Each epoch records the following values in lamports:

```text
gross_distributable(e) =
  finalised_treasury_fees_deposited(e)
  + rollover_in(e)

sum_of_merkle_claims(e) = Σ merkle_claim(w, e)
rounding_dust(e) =
  gross_distributable(e) - sum_of_merkle_claims(e)
  // only when total_weight(e) > 0

epoch_claim_liability(e) = sum_of_merkle_claims(e)
rollover_out(e) = rounding_dust(e) + zero_weight_rollover_out(e)
```

Only `epoch_claim_liability(e)` is reserved indefinitely for that epoch's
unexpired claims. `rollover_out(e)` is not a liability of the closed epoch and
is credited to the next epoch before its `gross_distributable` value is fixed.
The distribution vault or its accounting sub-ledger must therefore preserve
exactly the unclaimed portion of `sum_of_merkle_claims(e)`, not the full gross
amount. Claims across all wallets can never exceed that sum.

#### 4.4.2 Reproducible calculation artifact

The indexer produces an `EpochCalculationManifest` from finalised on-chain
events. The manifest must include:

- programme ID, network, epoch ID, and finalised slot range;
- calculation-code commit hash, reproducible build identifier, and schema versions;
- ordered lock-event input hash and lock-interval output hash;
- `gross_distributable`, `total_weight`, `sum_of_merkle_claims`,
  `rounding_dust`, `zero_weight_rollover_out`, and `rollover_out`;
- canonical leaf ordering and a hash of the complete leaf file;
- domain-separated Merkle root;
- distribution-vault balance and reconciliation result.

The complete manifest and leaf file must be published through a
content-addressed URI and be reproducible using open calculation code. Two
independent implementations, one in Rust and one in TypeScript, must consume the
same canonical inputs and produce the same manifest totals, complete leaf-file
hash, and Merkle root before a provisional root may be published. Shared test
vectors are mandatory, but production agreement must also be checked for every
epoch.

#### 4.4.3 Root publication, challenge, replacement, and sealing

The settlement model is **optimistic and publicly verifiable**. The programme
verifies commitments, declared totals, vault solvency, challenge state, and each
individual Merkle proof. A Merkle root alone does not prove that every eligible
position was included or that every interval was calculated semantically
correctly. Global correctness therefore relies on the authorised publisher,
independent Rust/TypeScript reproduction, public artifacts, and the challenge
process below.

The Merkle-root lifecycle is:

1. A designated `EpochRootPublisher` operational key may submit a
   `PROVISIONAL` root, the manifest hash, leaf-file hash, calculation-code commit,
   and content-addressed artifact URIs. This key cannot withdraw funds, change
   beneficiaries, resolve challenges, or seal a challenged root.
2. A **24-hour verification window** begins. Claims remain disabled. Challenges
   must be submitted before this original window closes; a challenge does not
   extend the window.
3. Any wallet may call `challenge_epoch_root` with `epoch_id`, `root_version`, a
   canonical `reason_code`, `evidence_hash`, content-addressed evidence URI, and
   a refundable challenge bond of `0.02 SOL`. The same `(root_version,
   evidence_hash)` cannot be submitted twice. A valid challenge changes the root
   state to `CHALLENGED` and blocks sealing.
4. The active treasury multisig must resolve all challenges no later than
   **48 hours after the original 24-hour verification window ends**:
   - **accept:** return the bond, cancel the provisional root, publish the
     correction reason, and authorise a replacement;
   - **reject:** publish a reason hash and transfer the bond to the
     `Correction Reserve Vault`.
5. If the resolution deadline passes with any unresolved challenge, the
   provisional root automatically becomes `EXPIRED_UNRESOLVED`, cannot be
   sealed, and must be replaced by a new root version.
6. Every replacement increments `root_version` and starts a new, complete
   24-hour verification window. Old challenges and evidence remain public.
7. After the window ends with no unresolved challenge, `seal_epoch_root` may be
   executed permissionlessly. The instruction verifies state, version, declared
   totals, reserved liability, and distribution-vault reconciliation, then
   changes the epoch to `SEALED`. It does not independently reconstruct the full
   manifest or prove semantic completeness of all leaves.
8. A sealed root, its leaf entitlements, and its `sum_of_merkle_claims` are
   immutable under the Tokenomics Core programme. The Tokenomics Core upgrade
   authority must be revoked before real-value mainnet activation, so no future
   programme upgrade can replace a sealed root or claw back a valid claim.
   Post-seal underpayment is handled only through a separately funded correction
   epoch under Section 4.4.5; it may add an entitlement but cannot reduce one.

The `0.02 SOL` bond is a launch default. Changing it requires the treasury
multisig and public notice, and applies only to roots whose
verification window starts after the change.

For an epoch with zero total weight, the programme publishes the manifest and
rollover values but records `ROLLED_OVER_NO_WEIGHT`; it does not publish a
claimable Merkle root or open a challengeable claim set.

#### 4.4.4 Claim destinations and expiry

A `(epoch, leaf_id)` claim PDA prevents a second claim. Claims never expire.
The leaf binds the beneficiary, amount, asset, epoch, programme, and network.
The transaction caller may be the beneficiary or a permissionless keeper, but
the destination cannot be supplied or changed by the caller:

- an ordinary holder's claim pays the beneficiary wallet encoded in that
  holder's sealed leaf;
- the claim for the 800M treasury `LockPosition` pays only the published
  `Treasury SOL Vault` encoded in its sealed leaf.

All valid claims use the same settlement path and are executable immediately
after the epoch is sealed. They are not treasury withdrawal proposals, require
no treasury multisig approval, and are not subject to treasury-operation
approval. A permissionless keeper may execute the treasury claim because the
leaf fixes the destination and the caller cannot redirect the SOL.

A token transfer or unlock after the epoch snapshot cannot alter the closed
epoch's entitlement. Tokens must have been locked, not merely held, during the
epoch. Wrong beneficiary, wrong amount, wrong epoch, wrong network, invalid
proof, duplicate claim, or claim above the remaining sealed liability must fail.

This design avoids repeatedly calculating `wallet share × current vault`,
separates user claims from treasury cash flow, and reconciles perpetual claims
with rollover of only the amount that was never assigned to a claim leaf.

#### 4.4.5 Post-seal correction epochs and correction reserve

A post-seal error may only create an additional entitlement for an underpaid
beneficiary. It cannot replace the original root, reduce an entitlement, recover
an overpayment, or debit another epoch's liabilities.

Every correction epoch must:

- reference the original `epoch_id`, sealed `root_version`, affected leaf or
  position, public incident record, and correction reason;
- contain only positive additional claim amounts;
- use the same provisional-root, challenge, sealing, and non-expiring claim
  rules as an ordinary positive-weight epoch;
- be fully funded before its provisional root is published;
- pay from a dedicated `Correction Reserve Vault`, never from the distribution
  vault's sealed liabilities, locker rollover, prize pools, campaign vaults, or
  another holder's entitlement.

The `Correction Reserve Vault` contains treasury-owned SOL only. It is funded
from the `Treasury SOL Vault` through a multisig-approved treasury allocation or a
previously approved spending limit whose fixed destination and purpose are the
correction reserve. Accepted challenge bonds are returned; rejected challenge
bonds are added to this reserve. If the reserve is insufficient, the correction
remains publicly recorded as unfunded and cannot create a claim until the
Treasury SOL Vault funds it. No debt is imposed on holders or future fee epochs.

### 4.5 Unlocking

Unlocking has no protocol unbonding delay. Once a valid unlock instruction is
confirmed, the programme captures accrued weight through that timestamp; the
unlocked amount stops accruing immediately and becomes available at the
canonical return destination.

For an ordinary holder, the destination is the wallet or token account bound to
that holder's `LockPosition`. For the 800M treasury position, the destination is
only the canonical `Creator Treasury Reserve Vault`. The treasury instruction
requires the active multisig threshold, but it has no post-approval execution delay because
the tokens move only from the programme-controlled `Treasury Lock Escrow` back
inside the treasury custody perimeter.

The treasury approval threshold applies only if a later instruction attempts to move those
tokens out of the `Creator Treasury Reserve Vault` for a campaign, sale,
liquidity, pledge, remuneration, grant, or another discretionary purpose. Claim
settlement from the fee-distribution pool and token unlock from the lock escrow
are independent operations and neither triggers the other.

### 4.6 User experience

The wallet-gated Token screen must show:

- unlocked balance, locked balance, and pending unlock state;
- the current epoch, time remaining, and the user's accumulated current-epoch
  lock weight;
- claimable SOL only after an epoch is sealed;
- historical claims, amount, epoch, transaction signature, and audit link;
- a clear warning that unlocking stops future accrual for the unlocked amount.

The UI must never promise an estimated SOL return as guaranteed yield.

## 5. Promotional Token Policy

### 5.1 Initial reserve and ceiling

The initial promotion may distribute at most `200,000,000` tokens, equal to
20% of total supply. The complete allocation is prefunded at genesis into the
programme-controlled `Initial Campaign Reserve Vault`; neither the vault nor its
PDA is a mint authority. Every reward atomically decrements that vault's
remaining balance. The promotion has no round-based expiry and ends only when
the complete 200M reserve has been distributed. When depleted, the promotion
stops and the UI/API reports the exhaustion instead of substituting another
funding source.

The 200M ceiling applies collectively to all reward types in the initial
promotion described in this section. Tokens remaining in the initial vault are
reserved exclusively for that promotion and do not participate in treasury-fee
distributions. Future promotions may receive existing tokens from the 800M
Creator Treasury Reserve through the multisig approval process, but each
future campaign requires a separately approved configuration and a separate
programme-controlled vault with its own formula, maximum allocation, stop
condition, unused-balance policy, and public accounting. No campaign may
increase total supply or debit another campaign's vault.

### 5.1.1 Terminal reserve settlement and exact exhaustion

The campaign balance is represented in integer token atoms. The initial
promotion ends only when the `Initial Campaign Reserve Vault` balance reaches
exactly zero. No positive residue may remain stranded merely because it is less
than the next nominal reward.

Every eligible reward is decomposed into one or more canonical **reward legs**.
For each leg:

```text
paid_reward_atoms = min(nominal_reward_atoms, remaining_campaign_atoms)
remaining_campaign_atoms -= paid_reward_atoms
```

If `0 < remaining_campaign_atoms < nominal_reward_atoms`, the programme transfers
the entire remaining balance as a final partial reward, records
`FINAL_PARTIAL_REWARD`, sets the vault balance to zero, and records
`PROMOTION_CAMPAIGN_EXHAUSTED`. The unpaid difference creates no debt or future
entitlement. Subsequent game actions remain valid but generate no promotion
reward.

Reward events are ordered by finalised on-chain settlement order. Multi-leg
events use the following deterministic internal order:

1. proposal or supporter action: the single action beneficiary;
2. active-rule settlement: creator reward first, then the voter reward pool;
3. referral qualification: inviter base reward first, then invitee base reward;
4. inviter first-round bonus: a separate leg at first-round settlement.

When a voter pool is funded, its complete funded amount is distributed without
leaving token-atom residue. Eligible voter wallets are sorted by public-key
bytes. Each receives `floor(pool_atoms / voter_count)` atoms, and the first
`pool_atoms % voter_count` wallets in that canonical order receive one additional
atom. The programme must serialize concurrent settlements so that exactly one
canonical final leg consumes the last campaign atoms and no execution can
overdraw the vault.

This rule guarantees exact exhaustion **when the next eligible reward leg is
settled**. It does not guarantee exhaustion by a particular date. If a positive
residual balance exists and no later eligible event ever occurs, the campaign
remains open and the residual tokens remain isolated in its vault; no
administrative sweep, arbitrary redistribution, or treasury reclassification is
permitted.

### 5.2 Proposal and supporter action rewards

While the initial promotion reserve has a positive balance, eligible rule
proposals and in-favour votes receive fixed promotional-token rewards. The
promotion remains available across rounds until the 200M reserve is exhausted.
There is no round-200 cutoff. The underlying game may change its fee schedule
without ending the promotion. The first same-wallet action in each configured
fee scope — first guess, first rule proposal, and first same-wallet/same-rule/
same-side approval or elimination vote — may be free only before the
environment-configured `freeActionWindowEndsBeforeTurnIndex` (main PRD §8.2):
**round 31 onward in production** (window = rounds 1–30), and **turn 100 onward
in development/staging/devnet** (window = turns 1–99) while the project is being
built. From the configured cutover onward, normal game fees apply while eligible
promotional-token rewards may continue until the reserve is exhausted.

Every successfully confirmed on-chain `propose_rule` action has a nominal
reward of `0.4` tokens. Every successfully confirmed on-chain in-favour `vote`
action has a nominal reward of `0.06` tokens, equal to 15% of the proposal-action
reward. The terminal partial-payment rule in Section 5.1.1 applies when the
remaining campaign balance is below either nominal amount. Each confirmed action creates its nominal reward obligation; repeated proposals
and repeated in-favour votes remain independently eligible, subject only to the
terminal partial-payment rule when the reserve reaches its final atoms. A later rule
invalidation, removal, finalist outcome, election outcome, or game result does
not revoke a reward that was already earned by a confirmed action.

There is no per-wallet, per-rule, or per-round reward cap for these paid or free
actions. The only economic limit is the remaining balance of the 200M initial
promotion reserve. The programme must reserve/debit a reward atomically at the
action so concurrent actions cannot over-distribute. When the reserve is
exhausted, the underlying game action remains valid but has no token reward; the
transaction and UI must state `PROMOTION_CAMPAIGN_EXHAUSTED` explicitly.

The campaign must never reclassify a prize-pool payment as a token reward.

### 5.3 Active-rule creator and elected-rule voter rewards

The economic formula from the original SOL-denominated model is preserved, but
the resulting creator and voter rewards are paid in Idealer tokens from the
active campaign reserve. No direct SOL payment is made for these rewards.

Eligibility requirements:

- the alternative rule became the active Rule of the Hour for the turn;
- the active alternative rule produced at least one valid winner;
- the individual alternative-rule winner payout is calculated first in SOL,
  using the final alternative prize bucket and valid winner count;
- the creator reward equals `15%` of one individual alternative-rule winner
  payout;
- the elected-rule voter reward pool also equals `15%` of one individual
  alternative-rule winner payout;
- the voter reward pool is split equally among the unique wallets with at least
  one confirmed in-favour vote for the elected rule;
- repeated in-favour votes may affect the rule's approval count but do not create
  additional voter-reward shares for the same wallet;
- if the elected rule has no eligible voter wallet, no voter reward is paid;
- elimination votes do not qualify for the elected-rule voter reward;
- rewards are reserved and debited atomically from the active campaign reserve;
- no winner payout, prize-pool balance, sealed treasury-fee entitlement, or SOL
  locker distribution may be reduced to fund these rewards.

#### 5.3.1 Reward-only SOL-to-token accounting rate

The token uses nine decimals. Therefore, for the sole purpose of calculating the
active-rule creator reward and elected-rule voter reward, the protocol applies
an exact smallest-unit relation:

```text
1 SOL = 1,000,000,000 lamports
1 Idealer token = 1,000,000,000 token atoms
1 calculated reward lamport = 1 Idealer token atom
```

This relation applies **only** to these two reward calculations. It does not
establish a market-price peg, redemption right, exchange obligation, secondary-
market price, or general conversion rule.

All arithmetic uses unsigned integer values, `u128` intermediates, multiplication
before division, and floor rounding:

```text
individual_alternative_payout_lamports =
  floor(alternative_rule_prize_pool_lamports / alternative_rule_winner_count)

calculated_creator_reward_atoms =
  floor(individual_alternative_payout_lamports * 1,500 / 10,000)

calculated_voter_reward_pool_atoms =
  floor(individual_alternative_payout_lamports * 1,500 / 10,000)

creator_reward_cap_atoms = 250,000,000
voter_reward_pool_cap_atoms = 250,000,000
```

The campaign reserve is drawn in deterministic order:

```text
creator_reward_atoms = min(
  calculated_creator_reward_atoms,
  available_campaign_reserve_atoms,
  creator_reward_cap_atoms
)

remaining_campaign_reserve_atoms =
  available_campaign_reserve_atoms - creator_reward_atoms

voter_reward_pool_atoms = min(
  calculated_voter_reward_pool_atoms,
  remaining_campaign_reserve_atoms,
  voter_reward_pool_cap_atoms
)

base_per_voter_atoms =
  floor(voter_reward_pool_atoms / unique_eligible_voter_count)

extra_atom_recipient_count =
  voter_reward_pool_atoms % unique_eligible_voter_count

// wallets sorted by public-key bytes; the first
// extra_atom_recipient_count wallets receive one additional atom
```

Creator funding is applied first and the voter pool is funded from the remaining
campaign reserve. Any unpaid difference creates no debt or future entitlement.
The quotient-and-remainder split distributes every funded voter-pool atom.
Identical integer-math vectors must pass in the Solana programme, Rust services,
TypeScript services, and public calculator.

A future approved campaign may resume these rewards under the same formula or a
separately approved formula; continuation is never automatic.

### 5.4 Referral rewards

A referral is eligible only when all conditions hold:

1. The inviter creates a referral link/code before the invitee's first
   qualifying game action.
2. The invitee is permanently attributed to one inviter only.
3. The invitee completes their first confirmed guess, whether that guess is
   free or paid.
4. The guess is finalised and non-reverted.

Once eligibility is confirmed, the inviter has a nominal reward of `0.2`
tokens. The invitee has a nominal reward of `0.03` tokens, equal to 15% of the
inviter reward. These are separate canonical reward legs and are subject to the
terminal partial-payment rule in Section 5.1.1. In the invitee's
first playing round, the inviter also receives a one-time bonus equal to 15% of
the promotional-token rewards granted to that invitee in that round:

```text
invitee_referral_reward = 0.2 × 15% = 0.03 tokens
inviter_first_round_bonus = floor(invitee_first_round_promotion_rewards × 15%)
```

All three rewards debit the same 200M promotional reserve and are settled in
the canonical order and partial-payment policy in Section 5.1.1. A referral is
paid once per invitee. The first-round bonus is paid once only after that round
is settled.

`invitee_first_round_promotion_rewards` is the sum of reward atoms actually paid
to the invitee during that round from the active promotional campaign for:

- the invitee base referral reward;
- proposal-action rewards;
- supporter-action rewards;
- an active-rule creator reward received by the invitee;
- an elected-rule voter reward received by the invitee.

It excludes prize SOL, treasury-fee claims, token transfers or purchases, unpaid
nominal shortfalls, rewards earned by the invitee for inviting another user, and
any downstream referral-chain bonus. This closed list prevents recursive bonus
calculation. Self-referrals, duplicate wallet attribution, and rewards based
solely on visiting a link are forbidden.

### 5.5 Anti-abuse and infrastructure controls

- Attribution is a set-once on-chain record.
- The invitee's first guess must be finalised and non-reverted; it qualifies
  whether the applicable game-fee policy makes it free or paid.
- One reward per referred wallet. There is no per-inviter economic cap; the programme-wide cap is the remaining balance of the active campaign vault.
- Referral reward settlement is idempotent, using a unique referral-reward PDA.
- The API may flag suspicious clusters for review but cannot invent a reward;
  the on-chain eligibility conditions remain authoritative.
- Campaigns must publish aggregate issuance, remaining reserve, qualified
  referrals, rejected attempts by reason, and rewards paid.

### 5.6 Future campaigns funded from the Creator Treasury Reserve

The 200M `Initial Campaign Reserve Vault` funds only the initial promotion.
After it is exhausted, a future campaign may be funded by transferring an
approved amount of existing tokens from the 800M Creator Treasury Reserve into
a newly created, campaign-specific programme-controlled vault. Each such
campaign must be independently authorised through the confirmed multisig and
active 2-of-3 multisig threshold and must publish, before execution:

- the amount transferred from the Creator Treasury Reserve;
- eligible actions or outcomes and exact reward formulas;
- the maximum campaign spend and deterministic stop condition;
- start conditions and any expiry, if the future campaign uses one;
- reserve-exhaustion and concurrent-settlement behavior;
- public issuance, concentration, and reconciliation metrics;
- the destination and authority of the dedicated future campaign vault;
- the treatment of tokens that remain unused when the campaign stops or expires;
- proof that the campaign programme cannot debit the Creator Treasury Reserve,
  another campaign vault, the prize vault, or any SOL vault.

The approved tranche must be transferred directly from treasury custody to the
new campaign vault immediately after multisig approval; it must not pass through a founder or
operator wallet. The campaign programme then settles ordinary rewards without
per-reward multisig approvals.

The campaign configuration is editable only in `DRAFT`. Funding transitions it
to `FUNDED` and irreversibly freezes campaign ID, mint, vault, allocation,
eligibility, formula, caps, ordering, start/stop/expiry conditions, partial-
payment rule, and unused-balance policy. Pause/resume may remain operational if
predeclared, but an economic amendment requires a new campaign and new vault.

Moving existing treasury tokens into a future campaign reduces the quantity the
treasury can keep locked and therefore may reduce its future share of
treasury-fee distributions. This is an intended and publicly measurable
economic trade-off.

## 6. Architecture and Security Requirements

### 6.1 On-chain accounts and instructions

Required programme state includes a `TokenConfig`, `CreatorTreasuryReserveVaultRecord`,
`TreasuryLockEscrowRecord`, allocation-vault records, `LockPosition`,
`DistributionEpoch`, `EpochCalculationManifestRecord`, `EpochRootChallenge`,
`TreasuryDistributionClaim`, `CorrectionReserveVaultRecord`, `CorrectionEpoch`,
`TreasuryPolicyExecutor`, `CampaignReserve`, `CampaignVaultRecord`, `CampaignConfig`, `ActiveRuleCreatorReward`, `ElectedRuleVoterReward`,
`ReferralLink`, and `ReferralReward`. Each `CampaignVaultRecord` binds exactly one campaign ID,
token mint, SPL vault address, programme-derived transfer authority, original
allocation, cumulative distribution, remaining balance, and unused-balance
policy.

Required instructions include:

- initialise the mint, canonical Metaplex metadata, `TreasuryPolicyExecutor`-controlled Creator Treasury Reserve Vault and Treasury SOL Vault, programme-controlled Treasury Lock Escrow, Correction Reserve Vault, and the 200M Initial Campaign Reserve Vault in one transaction; validate allocations; lock the complete 800M reserve; then revoke mint and freeze authorities before the transaction can succeed;
- create a future campaign vault and fund it with a multisig-approved treasury tranche;
- lock treasury tokens into the canonical escrow and unlock them immediately
  back to the canonical reserve vault after a valid multisig-authorised
  instruction, without an execution delay or additional unbonding period;
- schedule and execute discretionary outbound treasury movements through the
  on-chain multisig-governed treasury executor;
- create or amend bounded spending limits only through the same multisig
  governance path;
- deposit the configured treasury-fee share;
- publish a provisional epoch root and calculation-manifest hash;
- challenge a provisional root with the configured bond, reject duplicate evidence, resolve within the deadline, expire unresolved roots, cancel, and replace roots during the review lifecycle;
- seal an unchallenged or resolved epoch root after the verification window;
- claim a sealed distribution immediately after sealing only to the beneficiary
  encoded in its leaf, without applying treasury-operation approval;
- settle proposal-action, supporter-action, active-rule creator, and
  elected-rule voter rewards only from the campaign-specific vault bound to the
  active campaign configuration;
- register an attribution, confirm qualifying play, and claim referral rewards;
- activate the bounded emergency pause under Section 6.5 without blocking safe-exit claims or unlocks.

No instruction may mint after genesis or change the fixed total supply.

### 6.2 Indexing and settlement

The indexer must derive lock intervals and campaign eligibility from finalised
on-chain events. It must be reorganisation-safe and idempotent. It must publish
the reproducible `EpochCalculationManifest`, complete canonical leaf file, and
all accounting totals required by Section 4.4. Merkle leaf formats must bind the
programme ID, network, epoch, beneficial position or wallet, fixed beneficiary,
amount, and asset type. Rust and TypeScript implementations require shared test
vectors and must produce identical roots and accounting totals.

### 6.3 Auditability and controls

- The genesis transaction, mint authority revocation, allocation vault balances,
  every campaign vault address and authority, campaign reserve balances, fee
  splits, locks, epoch roots, and claims are publicly auditable.
- Critical configuration changes and discretionary outbound treasury movements
  must be controlled by the named multisig through an on-chain executor or
  equivalent multisig-native mechanism with no direct-transfer bypass. The
  execution delay is zero; protocol claims and canonical lock/escrow returns
  remain independent of multisig approval.
- The immutable supply cannot be changed after mint-authority revocation. Sealed epochs and prior claims are protected by the immutable Tokenomics Core programme after its upgrade authority is revoked before real-value mainnet activation.
- Provisional epoch roots, challenges, root replacements, resolution reasons,
  root versions, manifests, and final sealing transactions must be public. A
  sealed root is immutable; post-seal remediation uses a separately funded
  correction epoch rather than replacement or clawback.
- Checked arithmetic, canonical PDAs, account-owner/mint validation, and
  checks-effects-interactions ordering are mandatory.
- A mainnet security audit is a launch gate, not a post-launch task.

### 6.4 Programme separation and upgrade-authority policy

The implementation must separate components by their required changeability.

**Tokenomics Core — immutable before real-value mainnet activation:**

- locking escrows and `LockPosition` state;
- distribution epochs, root lifecycle, claims, and correction epochs;
- campaign-vault custody and deterministic reward settlement;
- `TreasuryPolicyExecutor`, treasury vault authority, and safe-exit controls.

The Tokenomics Core may remain upgradeable during local development, devnet,
audits, and rehearsals. Before any real-value mainnet lock, fee deposit, campaign
reward, or treasury funding, its deployed binary and programme data must be
audited, the final programme hash published, and its upgrade authority set to
`None`. No proxy, loader authority, alternate programme signer, or migration
instruction may retain equivalent power over its PDAs.

**Game and Application Layer — updateable:** turns, game rules, AI compiler,
indexer, APIs, frontend, analytics, and other product components may remain
upgradeable under the active multisig. They cannot become
an authority over Tokenomics Core vaults or mutate sealed tokenomic state.

### 6.5 Emergency pause and safe-exit invariants

An `EmergencyGuardian` may activate a pause but cannot unpause, transfer assets,
change beneficiaries, resolve roots, modify configuration, or bypass the
multisig. Unpause requires the active multisig, a public incident/mitigation
record, and at least 24 hours' notice.

The pause may block only new exposure or unfinished discretionary activity:

- new locks and new fee deposits;
- publication or sealing of new epoch roots;
- creation of new campaign rewards or funding of new campaigns;
- new discretionary treasury schedules and execution of unexecuted movements;
- other new state explicitly listed in the audited pause matrix.

The pause must never block safe exit or already acquired rights:

- claims from epochs or correction epochs already sealed;
- prize claims already finalised under the game programme;
- ordinary-holder unlocks;
- canonical treasury unlocks from `Treasury Lock Escrow` to the
  `Creator Treasury Reserve Vault`;
- claims or campaign rewards already atomically settled before the pause.

### 6.6 Legal and operational gate

A transferable token tied to treasury-fee distributions may create securities,
financial-promotion, tax, consumer-protection, AML/KYC, and gambling-regulation
obligations. Before any real-value/mainnet activation, qualified counsel must
approve the target jurisdictions, disclosures, eligibility/geofencing, and
operational controls. This is a mandatory product gate, not legal advice.

## 7. Metrics

Track and publish, at minimum:

- fixed supply and allocation-vault balances;
- locked supply, unique lockers, average lock duration, and lock concentration;
- Creator Treasury Reserve locked balance, epoch weight, claims, and share of
  each sealed distribution;
- treasury fee deposited, `gross_distributable`, `total_weight`,
  `sum_of_merkle_claims`, sealed liability, claimed, unclaimed,
  `rounding_dust`, zero-weight rollover, and total rollover by epoch;
- provisional root publisher, manifest and leaf-file hashes, calculation commit, root version, challenge bonds, evidence hashes, resolution deadlines, expired roots, replacement history, verification-window timestamps, and sealing transaction;
- Initial Campaign Reserve Vault address, authority, original 200M allocation,
  issued/remaining balance, rewards by reward type, and estimated actions
  supportable by the remaining balance;
- each future campaign vault's source treasury transaction, original allocation,
  issued balance, remaining balance, programme authority, stop condition, and
  unused-balance status;
- proposal-action rewards, in-favour-vote-action rewards, calculated
  individual alternative-rule payouts in SOL, reward-only 1:1 accounting
  conversions, active-rule creator token rewards, voter token reward pools,
  unique voter recipients, caps, reserve shortfalls, and per-voter amounts;
- reward activity during rounds 1–30 compared with paid activity from round 31;
- future-campaign transfers from the Creator Treasury Reserve and their effect
  on the treasury's locked balance and epoch share;
- referral conversion from attributed invite to qualifying play;
- reward rejection and duplicate-attempt rates;
- final partial reward type, beneficiary, nominal amount, paid amount, and exact
  campaign-vault exhaustion transaction;
- correction-reserve funding, correction epochs, challenge-bond inflows/outflows, claim success/failure, Merkle-proof failures, and reconciliation differences.

## 8. Milestones, Submilestones, and Approval Criteria

All boxes are deliberately unchecked. A box may be ticked only after explicit
user confirmation.

### M10.0 — Tokenomics specification and go/no-go

- [ ] **M10.0.1 — Confirm fixed-supply and allocation policy.**
  - Approval: 1B supply, decimal precision, full 100% allocation table,
    custodians, and vesting/transfer rules are approved; mint/freeze authority
    revocation is documented.
- [ ] **M10.0.2 — Confirm treasury distribution policy.**
  - Approval: fee share, epoch cadence, lock/unlock policy, claim expiry, and
    dust handling are approved with worked examples.
- [ ] **M10.0.3 — Legal and risk review.**
  - Approval: written counsel/go-to-market decision identifies permitted
    jurisdictions and the mainnet controls required before launch.
- [ ] **M10.0 approval.**
  - Approval: all M10.0 submilestones are approved; no unresolved economic,
    custody, or eligibility ambiguity changes a user's entitlement.

### M10.1 — Immutable fixed-supply token

- [ ] **M10.1.1 — Genesis mint, allocation vaults, and initial custody.**
  - Approval: exactly 1B tokens are minted once; 200M are deposited directly in
    the programme-controlled Initial Campaign Reserve Vault and 800M through the Creator Treasury Reserve Vault into the Treasury Lock Escrow after genesis validation; the total equals the allocation table; the
    campaign vault has no locking weight; the reserve and SOL vaults are technically controlled by the TreasuryPolicyExecutor governed by the founder-controlled `2-of-3` multisig, while locked reserve
    tokens move into the programme-PDA-controlled Treasury Lock Escrow under a
    multisig-owned `LockPosition`; the three signer wallets use independent
    devices and seeds; recovery procedures are documented; tests prove that
    canonical lock/unlock and fee-pool claims execute without a treasury delay,
    while discretionary outbound vault movements require the active multisig
    threshold and cannot bypass its executor.
- [ ] **M10.1.2 — Irreversible authority revocation.**
  - Approval: mint authority and freeze authority are `None`; an attempted
    second mint fails in automated and devnet tests.
- [ ] **M10.1.3 — Tokenomics Core immutability gate.**
  - Approval: custody, locking, epochs, claims, correction, campaign settlement,
    treasury executor, and pause programmes are audited; final programme hashes
    are published; all real-value vaults are bound to those programme IDs; the
    upgrade authority is revoked and no equivalent migration/proxy authority
    remains.
- [ ] **M10.1.4 — Multisig expansion rehearsal.**
  - Approval: devnet tests add two independently controlled member wallets to
    the initial `2-of-3`, verify both new signers, and change the configuration
    to `3-of-5` without losing vault authority or creating an unusable
    intermediate threshold; the audit record explicitly shows whether the
    founder still controls three signers.
- [ ] **M10.1 approval.**
  - Approval: public audit links and reconciliation prove the supply invariant.

### M10.2 — Locking and treasury-fee distribution

- [ ] **M10.2.1 — Token lock positions and treasury escrow separation.**
  - Approval: lock, top-up, and immediate partial/full unlock flows preserve
    custody and correctly stop future accrual; the TreasuryPolicyExecutor-controlled Creator Treasury Reserve Vault, governed by the multisig, and the programme-controlled Treasury Lock Escrow are distinct; the treasury multisig is the beneficial owner and sole treasury
    unlock authority; treasury unlocks return only to the canonical reserve
    vault and execute without an additional discretionary-movement delay.
- [ ] **M10.2.2 — Treasury fee routing.**
  - Approval: each paid action routes 100% of the defined treasury-fee share
    to the token-lock distribution vault; prize pools are unchanged; active-rule
    creator and elected-rule voter rewards are paid in tokens from the approved
    campaign reserve and never deducted from the sealed SOL distribution.
- [ ] **M10.2.3 — Time-weighted epoch accounting and zero-weight rollover.**
  - Approval: deterministic test vectors prove amount × time weighting,
    mid-epoch locks/unlocks, exact `gross_distributable`,
    `sum_of_merkle_claims`, sealed liability and `rounding_dust` calculations;
    an epoch with zero total weight creates no claims and rolls 100% into the
    next epoch; the Creator Treasury Reserve receives no privileged multiplier.
- [ ] **M10.2.4 — Pull claims and treasury cash-flow.**
  - Approval: ordinary holder claims pay once to the beneficiary wallet encoded
    in the leaf, while only the 800M treasury-position claim pays the fixed
    `Treasury SOL Vault`; invalid proof, double claim, cross-epoch replay,
    redirected beneficiary, and claim above the remaining sealed liability fail;
    both ordinary and treasury-position claims execute without the treasury
    delay; later operating withdrawals remain separate and obey the active
    multisig threshold or a previously approved on-chain spending limit.
- [ ] **M10.2.5 — Merkle-root publication and contestation.**
  - Approval: independent Rust and TypeScript calculations agree before publication; a restricted publisher can submit only a provisional root and content-addressed reproducible artifacts; claims remain disabled for the 24-hour review window; any wallet can challenge with a 0.02-SOL bond and unique evidence hash; accepted replacements increment the root version and restart the window; challenges are resolved within 48 hours after the window or the root expires; rejected bonds fund the Correction Reserve Vault; the programme explicitly does not claim to reconstruct semantic completeness on-chain; a sealed root is immutable after Tokenomics Core upgrade-authority revocation.
- [ ] **M10.2.6 — Correction reserve and positive correction epochs.**
  - Approval: a correction epoch references the original sealed epoch, contains only positive additional entitlements, is fully funded from the Correction Reserve Vault before publication, follows the ordinary challenge/seal path, and cannot debit sealed liabilities, rollover, prize pools, campaign vaults, or future holder distributions.
- [ ] **M10.2 approval.**
  - Approval: devnet reconciliation matches deposits, provisional and sealed
    roots, challenges, expired unresolved roots, user and treasury claims, correction funding and claims, exact epoch liabilities, rounding dust, and rollover for at least two wallets and two epochs.

### M10.3 — Initial promotion and token-denominated game rewards

- [ ] **M10.3.1 — Initial Campaign Reserve Vault and exact terminal settlement.**
  - Approval: exactly 200M tokens are deposited at genesis into a dedicated SPL
    vault controlled by the campaign-program PDA; the vault earns no
    treasury-fee weight, cannot be manually drained, cannot debit any other
    vault, and cannot over-distribute; when its remaining atoms are below the
    next nominal reward, one canonical final partial reward consumes the full
    balance, records the shortfall, and leaves the vault at exactly zero; tests also prove that a residual remains isolated if no later eligible event occurs and cannot be swept administratively.
- [ ] **M10.3.2 — Proposal and supporter action rewards.**
  - Approval: the `0.4` proposal-action and `0.06` in-favour-vote-action formulas,
    every-confirmed-action eligibility, rounds 1–30 first-action fee policy,
    normal fees from round 31, atomic reserve enforcement, and exhaustion-only
    termination are tested.
- [ ] **M10.3.3 — Active-rule creator and elected-rule voter rewards.**
  - Approval: deterministic tests preserve the original formula of `15%` of one
    individual alternative-rule winner payout for both the creator reward and
    voter reward pool; the atom-level relation `1 calculated reward lamport = 1 token atom`
    is applied without creating a market peg or redemption right; each reward
    respects its `0.25`-token per-turn cap; creator funding occurs before voter
    funding; the voter pool is split among unique eligible voter wallets using
    a canonical quotient-and-remainder atom allocation that consumes the full
    funded pool; repeated votes do not multiply a wallet's share; token rewards
    debit the campaign reserve atomically and no direct SOL reward is paid from
    the treasury-fee distribution vault.
- [ ] **M10.3.4 — Referral campaign.**
  - Approval: one-time attribution, first-guess (free-or-paid) proof, nominal
    `0.2` inviter, nominal `0.03` invitee, 15%-of-first-round-invitee-rewards
    bonus using the closed list of actually paid invitee referral/proposal/supporter/creator/voter rewards, exclusion of prizes, fee claims, transfers, unpaid amounts, and downstream referrals, canonical leg ordering, terminal partial payment, one-reward-per-invitee uniqueness, no per-inviter cap, aggregate campaign-vault cap, and idempotent settlement are tested.
- [ ] **M10.3.5 — Future campaign vault isolation.**
  - Approval: a devnet campaign is funded by a disclosed, multisig-approved tranche
    transferred directly from Creator Treasury custody to a new dedicated
    campaign vault; ordinary rewards require no per-payment multisig approval;
    funding freezes every economic configuration field; an attempted in-place economic amendment fails and requires a new campaign/vault; cross-campaign debits, operator-wallet routing, reserve bypass, and undefined unused-balance handling fail safely.
- [ ] **M10.3.6 — Abuse tolerance and integrity.**
  - Approval: accepted action farming cannot exceed the fixed reserve;
    self-referral, duplicate attribution, duplicate settlement, reverted action,
    concurrency overspend, and reserve-bypass tests fail safely and leave
    auditable evidence. The product may accept economically rational multi-wallet
    participation while protecting infrastructure and accounting integrity.
- [ ] **M10.3 approval.**
  - Approval: all rewards reconcile to the campaign-specific vault that funded
    them; no campaign can debit another vault, mint tokens, consume player prize
    funds, or create treasury-fee weight for undistributed campaign tokens.

### M10.4 — Product surface and transparency

- [ ] **M10.4.1 — Token and lock UX.**
  - Approval: mobile wallet flows show balances, lock consequences, epoch
    status, and claims in clear English; rejected/pending transactions recover.
- [ ] **M10.4.2 — Campaign and referral UX.**
  - Approval: invite links, qualification status, reward terms, reserve
    exhaustion progress, and fee changes after round 30 are accurate and do not
    imply guaranteed returns.
- [ ] **M10.4.3 — Public accounting.**
  - Approval: public views reconcile supply, allocation, reserve, locked
    weights, sealed epochs, claims, every campaign vault address and authority,
    source allocation, issuance, remaining balance, and unused-balance status
    without exposing sensitive user data.
- [ ] **M10.4.4 — Emergency pause safe exit.**
  - Approval: guardian pause blocks only new exposure and unexecuted discretionary actions; sealed claims, finalised prize claims, ordinary unlocks, and canonical treasury unlocks remain executable; guardian cannot unpause or move assets; multisig unpause requires a public incident record and 24-hour notice.
- [ ] **M10.4 approval.**
  - Approval: browser, API, wallet, and accessibility checks pass for the core
    flows.

### M10.5 — Verification, audit, and launch readiness

- [ ] **M10.5.1 — Automated verification.**
  - Approval: programme, API/indexer, worker, and web tests cover all M10
    invariants, shared Merkle vectors, and failure paths.
- [ ] **M10.5.2 — Independent security audit.**
  - Approval: audit findings are resolved or formally accepted with owner
    approval; no critical/high issue remains.
- [ ] **M10.5.3 — Devnet end-to-end rehearsal.**
  - Approval: genesis simulation, founder-controlled `2-of-3` custody, lock,
    fee deposit, epoch seal, fixed-destination treasury claim, approved
    operating allocation, genesis-funded PDA-controlled Initial Campaign Reserve
    Vault, proposal/supporter action rewards, alternative-winner payout calculation,
    `15%` creator and voter formulas, atom-level `1 calculated reward lamport = 1 token atom` conversion,
    independent `0.25`-token caps, creator-first reserve ordering, voter split,
    referral rewards, future-campaign vault tranche funding and isolation,
    unlock, zero-weight epoch rollover, provisional-root challenge and
    replacement, separate user/treasury claim destinations, exact epoch
    liabilities and dust rollover, final partial campaign reward, exact reserve
    exhaustion, and idempotent replay reconcile.
- [ ] **M10.5.4 — Mainnet go/no-go.**
  - Approval: M9 gates, M10.0 legal gate, multisig treasury operations,
    Tokenomics Core final programme hashes and upgrade-authority revocation, TreasuryPolicyExecutor no-bypass proof, safe-exit pause matrix, incident runbook, monitoring, and user disclosures are approved.
- [ ] **M10.5 approval.**
  - Approval: all launch gates are approved explicitly by the owner.

## 9. Required Verification Matrix

| Area | Minimum evidence |
| --- | --- |
| Supply | Genesis equals 1B; post-revocation mint always fails; allocation sum equals supply. |
| Locks | No backdated accrual; partial changes are exact; the TreasuryPolicyExecutor-controlled reserve vault and programme-controlled escrow are distinct; only the bound beneficial owner can request unlock and treasury tokens return only to the canonical reserve vault. |
| Distribution | Two-user and multi-interval calculations match; zero total weight rolls 100% forward without claims; `gross_distributable = sum_of_merkle_claims + rounding_dust` for positive-weight epochs; claims never exceed the sealed liability. |
| Proofs and roots | Wrong wallet, beneficiary, amount, epoch, network, or root fails; replay fails; provisional-root challenge/replacement and 24-hour review work; sealed roots are immutable after Tokenomics Core upgrade-authority revocation; optimistic settlement limitations are explicit. |
| Campaigns | Genesis funds exactly 200M into the dedicated PDA-controlled Initial Campaign Reserve Vault; campaign tokens earn no locking weight; exact action/referral formulas, creator/voter `15%` formulas, atom-level `1 calculated reward lamport = 1 token atom` conversion, independent 0.25-token caps, canonical reward-leg ordering, final partial payment to exact zero upon the next eligible leg, referral uniqueness and closed bonus base, vault isolation, future-campaign tranche funding, and atomic no-overspend behavior hold. |
| Accounting | Finalised events only; retries/reorgs are idempotent; on-chain/API/indexer totals reconcile. |
| Custody | Initial `2-of-3` rejects one-signer movement; independent-device recovery works; canonical treasury lock/unlock moves only between the reserve vault and escrow without delay; discretionary outbound vault movements require the active multisig threshold and cannot bypass its executor; a rehearsed expansion to `3-of-5` preserves authority and records founder-controlled signer concentration. |
| Treasury cash-flow | The distribution vault is not a treasury spending vault; ordinary claims pay their leaf-bound holder beneficiaries and the treasury-position claim pays the fixed Treasury SOL Vault, all without treasury-operation approval; claims do not unlock tokens; later operating withdrawals are separately scheduled, multisig-authorised or spending-limit constrained, and reconciled. |
| UX | Mobile wallet happy/rejection/retry flows; clear English disclosure; no guaranteed-return language. |

## 10. Decision Register

### 10.1 Confirmed owner decisions

| Decision | Confirmed rule |
| --- | --- |
| Supply | One immutable genesis supply of 1,000,000,000 tokens; no future minting. |
| Treasury-fee distribution | 100% of the treasury-fee share goes to token lockers. |
| Distribution cadence | One closed distribution epoch every seven completed turns. |
| Claim expiry | None; sealed claims remain available indefinitely. |
| Unlock | Every valid holder unlock, including the 800M treasury position, has no unbonding delay. Treasury tokens return only from the canonical Treasury Lock Escrow to the canonical Creator Treasury Reserve Vault; this internal custody movement is not subject to an execution delay. |
| Creator Treasury Reserve | The full 800M is eligible to lock and claim treasury fees under the same formula as every holder; its fee share finances operations. |
| Treasury vault and escrow | Unlocked treasury tokens are held in the TreasuryPolicyExecutor-controlled Creator Treasury Reserve Vault governed by the multisig. Locked treasury tokens are held in the programme-PDA-controlled Treasury Lock Escrow. The multisig is the beneficial owner and sole unlock authority, and every unlock returns only to the canonical reserve vault. |
| Treasury operating cash flow | SOL claimed by the locked 800M reserve settles immediately from the distribution vault to the fixed Treasury SOL Vault without multisig approval. A later discretionary transfer from the Treasury SOL Vault to an Operating Wallet, remuneration wallet, vendor, or other external destination requires the active multisig threshold and is immediately executable after approval. |
| Devnet treasury custody | The devnet rehearsal uses Squads Protocol v4 program `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` with founder-controlled `2-of-3` members `EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea`, `EAoZrh8TtZCYtUdKpkuMaNSrConsQoUQvzjZ7cuQGqdW`, and `7E3DMct5umGMA4mSeAr1UcJUFSd5kd444rK39G8GTC9p`. Phantom is the approved devnet signing application for member A. The finalized creation transaction `4TzMqySK4kdpcYb1ojTEzYyoCiibq8wrDkUMGdmNx2iXvTF2PLCXqUAbE7S1spLsV1o7XqLCRsZRnm9uJN8N3kAx` created multisig `DQmcXBdLsQUVsk8UmgnTdnjruRHnAquuFP9wPa87T5RD` and derived vault `0` `DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp`. A later finalized read confirmed that vault `0` is allocated as a system account and funded with 5 devnet SOL; this is rehearsal funding, not JDR issuance. All of these addresses are devnet-only; mainnet members require a separate decision. |
| Devnet token metadata governance | Genesis creates canonical Metaplex metadata for `JUSDEALER` (`JDR`) in the same transaction as the fixed supply. The devnet metadata update authority is Squads vault `0`, so no individual wallet can change the URI unilaterally; the approved HTTPS URI remains required before genesis. |
| Planned multisig expansion | Two new members may later be added to the same multisig and the threshold changed to `3-of-5` after both new wallets are tested. If the founder retains the original three keys, the founder still retains unilateral threshold control; this must be publicly disclosed. |
| Treasury execution | The execution delay is zero seconds. Discretionary outbound use of assets held in treasury-controlled vaults and critical authority, member, threshold, destination, or spending-policy changes still require the active `2-of-3` multisig and the on-chain executor without a direct-transfer bypass. Fee-pool claims, ordinary-holder claims, treasury-position claims to the fixed Treasury SOL Vault, and canonical lock/unlock movements remain immediate. |
| Claim destinations | Every sealed claim pays only the beneficiary encoded in its Merkle leaf. Ordinary holder claims pay the holder beneficiary; only the 800M treasury-position claim pays the fixed Treasury SOL Vault. Claims may be initiated permissionlessly but cannot redirect funds or unlock tokens. |
| Zero-weight epoch | If an epoch has no locked-token weight, it creates no claims and rolls 100% of its gross distributable SOL into the next epoch. |
| Epoch rounding and perpetual liabilities | `sum_of_merkle_claims` is the only perpetual liability retained for a sealed epoch. The difference between `gross_distributable` and that sum is rounding dust and rolls into the next epoch. |
| Merkle-root governance | Optimistic public settlement: independent Rust/TypeScript reproduction, content-addressed manifest and leaves, 24-hour challenge window, 0.02-SOL bond, 48-hour post-window resolution deadline, automatic expiry of unresolved roots, replacement-version restart, and permissionless sealing. The programme does not claim to semantically reconstruct the full manifest on-chain. |
| Programme immutability | Tokenomics Core remains upgradeable only through development/audit, then its upgrade authority is revoked before real-value mainnet activation. Game/application components remain updateable under active multisig governance. |
| Correction epochs | Post-seal underpayment is corrected only by a positive, separately funded correction epoch paid from the treasury-funded Correction Reserve Vault; no sealed entitlement is reduced and no locker/prize/campaign liability is debited. |
| Operating wallet | The founder may operate a separate bounded Operating Wallet. Funding above an approved budget or spending limit requires the active multisig controls. |
| Initial 800M lock | After allocation verification and mint-authority revocation, all 800M treasury tokens are locked. The initial unlocked treasury-token balance is zero; future uses require partial unlock followed by a separately multisig-approved outbound movement. |
| Emergency pause | Guardian may pause only new exposure; sealed claims, finalised prize claims, ordinary unlocks, and canonical treasury unlocks remain executable. Unpause requires multisig, incident disclosure, and 24-hour notice. |
| Holder autonomy | The project defines only official protocol utility; transfer, external integration, holding, or voluntary burning of unlocked tokens is outside project scope. |
| Free-action transition | The first-action free period end is environment-configured (`freeActionWindowEndsBeforeTurnIndex`, main PRD §8.2): it ends after round 30 in production/mainnet, and after turn 99 in development/staging/devnet while the project is being built. From the configured cutover onward, normal game fees apply while token promotions may continue. |
| Supporter | A wallet that casts an in-favour vote; every confirmed in-favour vote action is rewarded. |
| Proposal and supporter action rewards | While the initial reserve remains: every confirmed `propose_rule` creates a nominal 0.4-token reward and every confirmed in-favour `vote` creates a nominal 0.06-token reward; the final eligible leg may receive a partial amount that consumes the exact remaining vault balance. |
| Initial promotion custody | The complete 200M allocation is deposited at genesis into a dedicated Initial Campaign Reserve Vault controlled by the campaign-program PDA. The founder, app server, and general treasury cannot manually settle or redirect ordinary rewards. |
| Campaign reserve fee eligibility | Tokens held by an initial or future campaign vault remain liquid for rewards but are not locked and receive no treasury-fee distribution entitlement. Recipients may choose to lock tokens after settlement. |
| Future campaign vaults | Every future campaign receives an approved existing-token tranche directly from Creator Treasury custody into a separate programme-controlled campaign vault after multisig approval. Funding freezes all economic configuration; amendments require a new campaign and vault. Campaign vaults cannot debit one another. |
| Unused campaign balance | Each future campaign must define its unused-balance policy before funding. Unless another rule is explicitly approved, unused tokens remain isolated in that campaign's vault. |
| Active-rule creator reward | When an active alternative rule produces winners, its creator receives tokens equal to 15% of one individual alternative-rule winner payout in SOL, using the atom-level relation `1 calculated reward lamport = 1 token atom`, capped at 0.25 token per turn and subject to campaign-reserve availability. |
| Elected-rule voter reward | A token pool equal to 15% of one individual alternative-rule winner payout in SOL is calculated using the atom-level relation `1 calculated reward lamport = 1 token atom`, capped at 0.25 token per turn, then divided among unique eligible wallets; token-atom remainder is assigned by canonical public-key order, so shares differ by at most one atom; repeated votes do not multiply a wallet's share. |
| Reward-only accounting relation | With nine decimals, `1 calculated reward lamport = 1 Idealer token atom` exclusively for creator/voter calculations; integer math uses `u128`, multiplication before division, and floor rounding. This is not a market peg, redemption right, price promise, or general conversion rule. |
| Direct fund rewards | Active-rule creator and elected-rule voter rewards are not paid directly in SOL from platform monetisation or the treasury-fee distribution vault. |
| Future campaigns | Future promotions may use disclosed allocations transferred from the existing 800M Creator Treasury Reserve under multisig controls. |
| Referral qualification | The referred player's first confirmed guess, whether free or paid. |
| Referral rewards | Inviter: 0.2 tokens. Invitee: 0.03 tokens. Inviter first-round bonus: 15% of the invitee's actually paid first-round invitee referral, proposal, supporter, creator, and voter rewards; prizes, fee claims, transfers, unpaid amounts, and downstream referral rewards are excluded. No per-inviter cap; the active campaign-vault balance is the aggregate cap. |
| Initial promotion end | Only when the Initial Campaign Reserve Vault reaches exactly zero; there is no round-based expiry. The next eligible reward leg consumes any residual balance through partial payment. If no further eligible event occurs, the residual remains isolated and the campaign stays open. |

### 10.2 Remaining owner decisions required

These decisions remain blocking; no implementation should infer them.

| Priority | Decision needed | Why it matters |
| --- | --- | --- |
| P1 | Document device assignments, independent backup locations by role, and the `2-of-3` recovery procedure for the three supplied signer addresses before genesis. | The threshold and zero-second execution-delay policy for discretionary outbound treasury movements are confirmed, but the operational records are required to prove real key separation and recovery. |
| P1 | Confirm the initial Operating Wallet budget/spending limit and the process for replenishing it from the Treasury SOL Vault. | Required to let the solo operator cover routine costs without giving the daily wallet unrestricted treasury access. |
| P2 | Before expanding to `3-of-5`, document the two new member addresses, roles, independent key custody, test signatures, and the exact configuration-transition transaction. | Required to avoid an unusable threshold or false claims of independent governance during the expansion. |
| P1 | Confirm the approved HTTPS metadata URI for `JUSDEALER` (`JDR`) and, before mainnet, decide whether canonical metadata is immutable or governed by the mainnet multisig. | Nine decimals, token name, symbol, seller fee `0`, the complete initial 800M lock, and the devnet Squads-vault update authority are fixed; the URI is still required for genesis and public disclosure, while devnet authority must not be reused implicitly on mainnet. |
| P1 | Confirm target jurisdictions and user eligibility rules for real-value/mainnet activation. | Required before real-value fee distributions. |

## 11. Inconsistency Review

This draft resolves the former 400M/40M emission model by replacing it with a
single 1B genesis supply, a 200M initial promotion allocation held in a
separate programme-controlled Campaign Reserve Vault, and a fully lock-eligible
800M Creator Treasury Reserve. The 200M campaign allocation remains liquid for
reward settlement but earns no treasury-fee weight, and every future campaign
must use its own isolated vault funded by a disclosed multisig-approved tranche of the
existing 800M reserve. It confirms an initial
founder-controlled `2-of-3` multisig with physically and digitally separated
keys, zero-second execution after multisig approval for discretionary outbound
movements from treasury-controlled vaults, and a planned path to add two members and change the
same multisig to `3-of-5`. Protocol claims and canonical lock/unlock movements
inside the treasury custody perimeter are explicitly immediate and outside the
discretionary multisig-operation scope. It explicitly
discloses that the founder retains unilateral threshold control while holding
three qualifying keys. It also separates ordinary holder claims from the treasury position's
fixed-destination claim, distinguishes the TreasuryPolicyExecutor-controlled reserve vault governed by the multisig
from the programme-controlled lock escrow, and separates both from bounded
operating-wallet funding.

The draft replaces balance-only transferable revenue sharing with locking-based,
time-weighted, closed-seven-turn-epoch distributions; removes the former
round-200 campaign expiry; changes the first-action free window from 100 to 30
rounds; and preserves the original active-rule creator and elected-rule voter
formula of `15%` of one individual alternative-rule winner payout while paying
the resulting numerical amount in token atoms under the exclusive relation
`1 calculated reward lamport = 1 token atom`. This relation is not a market peg
or redemption promise. The draft now also
specifies zero-weight rollover, exact epoch liabilities and dust, a provisional
optimistic Merkle-root challenge and sealing process with independent
reproduction, bonds, resolution deadlines, and automatic expiry; an immutable
Tokenomics Core after upgrade-authority revocation; a treasury-funded correction
reserve; safe-exit emergency controls; fixed atom-level reward arithmetic; a
closed referral-bonus base with no per-inviter cap; funded-campaign configuration
immutability; and a terminal partial-reward rule that consumes the exact residual
on the next eligible reward leg. The complete 800M treasury allocation is locked
after genesis validation. No milestone has been marked complete or approved.
