// ============================================================
// Module: Founder Pass accounting core
// Specification: PRD-FOUNDER-PASS-NFT.md, milestone FP1
// Risk Level: Critical
// Security: See contracts/solana/security-checklist.md
// ============================================================
//
// This module is the "platform-neutral usage accounting" that
// `PRD-FOUNDER-PASS-NFT.md` §4.2 explicitly allows to be implemented while the
// Magic Eden Launchpad gate (FP-D1) and the sale decisions remain open.
//
// It deliberately implements NO benefit. Nothing here waives a Tyche fee,
// moves a lamport, or pays JDR; those are milestones FP2 and FP3. What it does
// implement is the part §3.2/§3.3 confirm as product rules — the per-asset
// allowances, the bounded distinct-turn set, and canonical asset verification —
// behind a governed configuration that starts fully unresolved and disabled.
//
// §14 of the PRD is the controlling constraint here: "Unresolved decisions
// block their dependent work; they do not silently select a default." Every
// open decision is therefore an explicit `Unset` variant or a zero sentinel,
// and `founder_pass_unresolved_decisions` refuses activation until governance
// has resolved each one. There is no default and no fallback.

use anchor_lang::prelude::*;

use crate::TycheError;

/// §3.2 confirmed per-pass allowances.
///
/// These are product constants, not governed parameters. `FounderPassConfig`
/// stores them so an auditor can read the active allowances directly from
/// chain, and `validate_founder_pass_allowances` refuses any stored value that
/// disagrees with these, so governance cannot quietly widen a confirmed limit.
pub const FOUNDER_PASS_VOTE_ALLOWANCE: u32 = 1_000;
pub const FOUNDER_PASS_RULE_PROPOSAL_ALLOWANCE: u32 = 100;
pub const FOUNDER_PASS_BET_ALLOWANCE: u32 = 50;

/// Length of the active-turn window, in consecutive turns.
///
/// Owner decisions of 2026-09-20, in two steps. First, the shared turn budget
/// stopped being a set of 100 **distinct** turn IDs and became a window of 800
/// **consecutive** turns. Then the window stopped being per-pass and became
/// **global**: it is anchored at `FounderPassConfig::activation_turn_id` and
/// runs to `activation_turn_id + 799` for every pass alike, rather than opening
/// at each pass's first benefit use.
///
/// Three consequences follow, and all three are product rules rather than
/// optimizations:
///
/// 1. The clock cannot be deferred. Declining to use a benefit no longer delays
///    anything, which is what the owner asked to simplify: a holder chooses
///    whether to spend a benefit, never when the window runs.
/// 2. Passes do **not** all get 800 usable turns. A pass that reaches its
///    holder late in the window inherits only the remainder, so purchase timing
///    changes realized value even though every pass carries identical quotas.
/// 3. There is no per-pass window state at all. `FounderPassUsage` keeps only
///    the action counters, and eligibility is a comparison against bounds read
///    from the governed config.
pub const FOUNDER_PASS_ACTIVE_TURN_WINDOW: u32 = 800;

/// §3.1 maximum collection supply. Stored on the config for the same reason as
/// the allowances, and pinned to this constant.
pub const FOUNDER_PASS_MAX_SUPPLY: u32 = 5_000;

/// Layout version for `FounderPassConfig` and `FounderPassUsage`. Both accounts
/// are new in FP1, so no existing bytes are reinterpreted (§6.3). A future
/// layout change must bump this and ship an explicit decoder/migration rather
/// than widening a field in place.
pub const FOUNDER_PASS_ACCOUNT_VERSION: u16 = 1;

// ------------------------------------------------------------------
// Open decisions (§14). Each bit is one decision that blocks activation.
// ------------------------------------------------------------------

/// FP-D2 — NFT standard and its canonical on-chain verifier.
pub const FP_DECISION_ASSET_STANDARD: u16 = 1 << 0;
/// FP-D2/FP-D5 — canonical collection address, read from finalized on-chain
/// collection creation (§4.3).
pub const FP_DECISION_CANONICAL_COLLECTION: u16 = 1 << 1;
/// FP-D2 — hard-cap proof: a verifiable platform cap or a governed, immutable
/// allowlist commitment (§4.3).
pub const FP_DECISION_SUPPLY_ENFORCEMENT: u16 = 1 << 2;
/// §7 — the shared campaign the JDR boost draws from.
pub const FP_DECISION_CAMPAIGN: u16 = 1 << 3;
/// FP-D6 — whether earning-time ownership must be snapshotted.
pub const FP_DECISION_OWNERSHIP_SNAPSHOT: u16 = 1 << 4;
/// FP-D7 — which JDR reward kinds qualify for the boost.
pub const FP_DECISION_BOOSTABLE_REWARD_KINDS: u16 = 1 << 5;
/// FP-D8 — funded sponsor versus a smaller turn pool for the waived fee.
pub const FP_DECISION_FEE_WAIVER_FUNDING: u16 = 1 << 6;
/// FP-D9 — per-rule/per-turn vote concentration limit and the multiple-pass
/// wallet policy.
pub const FP_DECISION_VOTE_CONCENTRATION: u16 = 1 << 7;

/// Every decision that gates benefit activation.
pub const FP_DECISIONS_REQUIRED_FOR_ACTIVATION: u16 = FP_DECISION_ASSET_STANDARD
    | FP_DECISION_CANONICAL_COLLECTION
    | FP_DECISION_SUPPLY_ENFORCEMENT
    | FP_DECISION_CAMPAIGN
    | FP_DECISION_OWNERSHIP_SNAPSHOT
    | FP_DECISION_BOOSTABLE_REWARD_KINDS
    | FP_DECISION_FEE_WAIVER_FUNDING
    | FP_DECISION_VOTE_CONCENTRATION;

// ------------------------------------------------------------------
// Governed policy selections
// ------------------------------------------------------------------

/// FP-D2. `Unset` is the birth state and is not a standard: it refuses every
/// asset. `MetaplexCore` is the §4.1 *provisional* standard. There is
/// deliberately no `Other`/fallback variant — adopting a different standard
/// requires a new variant plus its own reviewed verifier (§4.1).
///
/// New variants must be appended so previously written accounts keep their
/// encoding.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum FounderPassAssetStandard {
    Unset,
    MetaplexCore,
}

/// FP-D2 hard-cap proof (§4.3). `CollectionHardCap` means the mint mechanism
/// enforces a cap Tyche can verify on-chain; `AllowlistCommitment` means
/// activation carries an immutable commitment over at most 5,000 finalized
/// asset IDs. A mutable marketplace list or API hashlist is neither.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum FounderPassSupplyEnforcement {
    Unset,
    CollectionHardCap,
    AllowlistCommitment,
}

/// FP-D6 (§5.3). Whether the eligible pass is fixed when the reward is earned
/// or read at claim time. Retroactive acquisition must not create a boost.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum FounderPassOwnershipSnapshotPolicy {
    Unset,
    ClaimTimeOwnership,
    EarningTimeSnapshot,
}

/// FP-D8 (§8). Where the waived Tyche fee's SOL comes from. A waived fee can
/// never be booked as collected SOL, so exactly one of these must be chosen and
/// disclosed before any fee is waived.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum FounderPassFeeWaiverFunding {
    Unset,
    SponsorFunded,
    ReducedTurnPool,
}

/// The four benefits of §3.2. `JdrBoost` carries no lifetime action quota —
/// §3.2 gives it none — so it consumes only the shared distinct-turn budget.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum FounderPassBenefit {
    Vote,
    RuleProposal,
    Bet,
    JdrBoost,
}

/// A pure snapshot of the governed policy, so activation readiness is testable
/// without constructing an account.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FounderPassPolicy {
    pub asset_standard: FounderPassAssetStandard,
    pub asset_program_id: Pubkey,
    pub canonical_collection: Pubkey,
    pub campaign: Pubkey,
    pub max_supply: u32,
    pub supply_enforcement: FounderPassSupplyEnforcement,
    pub allowlist_commitment: [u8; 32],
    pub ownership_snapshot_policy: FounderPassOwnershipSnapshotPolicy,
    pub boostable_reward_kinds: u32,
    pub fee_waiver_funding: FounderPassFeeWaiverFunding,
    pub max_pass_vote_actions_per_rule_per_turn: u16,
    pub max_passes_per_wallet_per_turn: u8,
}

/// Returns the set of §14 decisions still unresolved. Zero means every
/// activation-gating decision has been governed; anything else must block
/// `enabled`.
pub fn founder_pass_unresolved_decisions(policy: &FounderPassPolicy) -> u16 {
    let mut unresolved = 0u16;

    if policy.asset_standard == FounderPassAssetStandard::Unset
        || policy.asset_program_id == Pubkey::default()
    {
        unresolved |= FP_DECISION_ASSET_STANDARD;
    }
    if policy.canonical_collection == Pubkey::default() {
        unresolved |= FP_DECISION_CANONICAL_COLLECTION;
    }
    // An `AllowlistCommitment` mode with an all-zero commitment is still an
    // unresolved decision, not an empty allowlist.
    match policy.supply_enforcement {
        FounderPassSupplyEnforcement::Unset => unresolved |= FP_DECISION_SUPPLY_ENFORCEMENT,
        FounderPassSupplyEnforcement::AllowlistCommitment => {
            if policy.allowlist_commitment == [0u8; 32] {
                unresolved |= FP_DECISION_SUPPLY_ENFORCEMENT;
            }
        }
        FounderPassSupplyEnforcement::CollectionHardCap => {}
    }
    if policy.max_supply != FOUNDER_PASS_MAX_SUPPLY {
        unresolved |= FP_DECISION_SUPPLY_ENFORCEMENT;
    }
    if policy.campaign == Pubkey::default() {
        unresolved |= FP_DECISION_CAMPAIGN;
    }
    if policy.ownership_snapshot_policy == FounderPassOwnershipSnapshotPolicy::Unset {
        unresolved |= FP_DECISION_OWNERSHIP_SNAPSHOT;
    }
    if policy.boostable_reward_kinds == 0 {
        unresolved |= FP_DECISION_BOOSTABLE_REWARD_KINDS;
    }
    if policy.fee_waiver_funding == FounderPassFeeWaiverFunding::Unset {
        unresolved |= FP_DECISION_FEE_WAIVER_FUNDING;
    }
    if policy.max_pass_vote_actions_per_rule_per_turn == 0
        || policy.max_passes_per_wallet_per_turn == 0
    {
        unresolved |= FP_DECISION_VOTE_CONCENTRATION;
    }

    unresolved
}

/// Pins the stored allowances to the §3.2 confirmed quantities.
pub fn validate_founder_pass_allowances(
    vote_allowance: u32,
    rule_proposal_allowance: u32,
    bet_allowance: u32,
    active_turn_window: u32,
) -> Result<()> {
    require!(
        vote_allowance == FOUNDER_PASS_VOTE_ALLOWANCE
            && rule_proposal_allowance == FOUNDER_PASS_RULE_PROPOSAL_ALLOWANCE
            && bet_allowance == FOUNDER_PASS_BET_ALLOWANCE
            && active_turn_window == FOUNDER_PASS_ACTIVE_TURN_WINDOW,
        TycheError::InvalidFounderPassAllowance
    );
    Ok(())
}

// ------------------------------------------------------------------
// Per-asset usage: quotas and the bounded distinct-turn set (§3.3, §6.2)
// ------------------------------------------------------------------

/// A read-only view of a `FounderPassUsage` account, so the §3.3 rules can be
/// unit-tested natively without an Anchor account or a validator.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FounderPassUsageView {
    pub vote_actions_used: u32,
    pub rule_proposals_used: u32,
    pub bets_used: u32,
}

/// The inclusive bounds of the global active-turn window.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FounderPassTurnWindow {
    pub start_turn_id: u64,
    pub end_turn_id: u64,
}

/// Resolves the one window every pass shares, from the governed activation
/// turn. A zero activation turn means benefits were never activated, so no
/// window exists and nothing is eligible.
pub fn founder_pass_turn_window(activation_turn_id: u64) -> Result<FounderPassTurnWindow> {
    require!(
        activation_turn_id > 0,
        TycheError::FounderPassTurnWindowClosed
    );
    let end_turn_id = activation_turn_id
        .checked_add(u64::from(FOUNDER_PASS_ACTIVE_TURN_WINDOW) - 1)
        .ok_or(TycheError::ArithmeticOverflow)?;
    Ok(FounderPassTurnWindow {
        start_turn_id: activation_turn_id,
        end_turn_id,
    })
}

/// The decided outcome of one attempted pass use. Every post-state value is
/// computed before anything is written, so a refusal leaves the account
/// untouched (§3.3: "A failed or reverted action consumes neither quota nor
/// turn").
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FounderPassUsePlan {
    pub benefit: FounderPassBenefit,
    pub turn_id: u64,
    /// The global window this use was judged against.
    pub window: FounderPassTurnWindow,
    pub vote_actions_used: u32,
    pub rule_proposals_used: u32,
    pub bets_used: u32,
}

/// Enforces the stored account's representation invariant.
///
/// With a global window there is no per-pass turn state left to validate, so
/// what remains is that no counter can exceed its allowance.
pub fn validate_founder_pass_usage(view: &FounderPassUsageView) -> Result<()> {
    require!(
        view.vote_actions_used <= FOUNDER_PASS_VOTE_ALLOWANCE
            && view.rule_proposals_used <= FOUNDER_PASS_RULE_PROPOSAL_ALLOWANCE
            && view.bets_used <= FOUNDER_PASS_BET_ALLOWANCE,
        TycheError::InvalidFounderPassUsage
    );
    Ok(())
}

/// Decides whether one pass use is allowed and what it costs, without writing.
///
/// `turn_id` is the turn the use is attributed to. For a JDR boost that is the
/// reward's **originating** turn, not the turn current at claim time (§3.3);
/// choosing it is the caller's responsibility in FP3.
///
/// Callers must not reach this function for an action that is already free
/// under ordinary game policy: §3.2 requires such an action to consume no quota
/// and mark no turn. That precondition belongs to the FP2 call sites, which
/// know the otherwise-due fee.
pub fn plan_founder_pass_use(
    view: &FounderPassUsageView,
    window: FounderPassTurnWindow,
    benefit: FounderPassBenefit,
    turn_id: u64,
) -> Result<FounderPassUsePlan> {
    require!(turn_id > 0, TycheError::InvalidTurnId);
    validate_founder_pass_usage(view)?;

    // The window is checked before the action quota, so an out-of-window
    // attempt reports the governing reason rather than a quota that is still
    // intact. Declining a benefit never defers this: the window is global and
    // runs whether or not a given pass is used.
    require!(
        turn_id >= window.start_turn_id && turn_id <= window.end_turn_id,
        TycheError::FounderPassTurnWindowClosed
    );

    let mut vote_actions_used = view.vote_actions_used;
    let mut rule_proposals_used = view.rule_proposals_used;
    let mut bets_used = view.bets_used;

    match benefit {
        FounderPassBenefit::Vote => {
            require!(
                vote_actions_used < FOUNDER_PASS_VOTE_ALLOWANCE,
                TycheError::FounderPassVoteAllowanceExhausted
            );
            vote_actions_used = vote_actions_used
                .checked_add(1)
                .ok_or(TycheError::ArithmeticOverflow)?;
        }
        FounderPassBenefit::RuleProposal => {
            require!(
                rule_proposals_used < FOUNDER_PASS_RULE_PROPOSAL_ALLOWANCE,
                TycheError::FounderPassProposalAllowanceExhausted
            );
            rule_proposals_used = rule_proposals_used
                .checked_add(1)
                .ok_or(TycheError::ArithmeticOverflow)?;
        }
        FounderPassBenefit::Bet => {
            require!(
                bets_used < FOUNDER_PASS_BET_ALLOWANCE,
                TycheError::FounderPassBetAllowanceExhausted
            );
            bets_used = bets_used
                .checked_add(1)
                .ok_or(TycheError::ArithmeticOverflow)?;
        }
        // §3.2 gives the JDR boost no lifetime action quota; it is bounded by
        // the distinct-turn budget and by the shared campaign balance, which
        // Tokenomics Core enforces in FP3.
        FounderPassBenefit::JdrBoost => {}
    }

    Ok(FounderPassUsePlan {
        benefit,
        turn_id,
        window,
        vote_actions_used,
        rule_proposals_used,
        bets_used,
    })
}

// ------------------------------------------------------------------
// Canonical asset verification (§6.2, §10)
// ------------------------------------------------------------------

/// What verification proved about an asset. Only facts read from the asset's
/// own on-chain account appear here; name, symbol, image, and URI are never
/// read as authorization input (§6.2).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FounderPassAssetFacts {
    pub asset: Pubkey,
    pub owner: Pubkey,
    pub collection: Pubkey,
}

// Metaplex Core `AssetV1` wire layout. Fixed-position fields first:
//   key: u8 | owner: Pubkey | update_authority: enum | name: String
//   | uri: String | seq: Option<u64>
const CORE_KEY_ASSET_V1: u8 = 1;
const CORE_KEY_PLUGIN_HEADER_V1: u8 = 3;
const CORE_KEY_PLUGIN_REGISTRY_V1: u8 = 4;

// `UpdateAuthority`: None = 0, Address(Pubkey) = 1, Collection(Pubkey) = 2.
// A Founder Pass must be bound to the canonical collection, so only variant 2
// is acceptable.
const CORE_UPDATE_AUTHORITY_COLLECTION: u8 = 2;

// `Authority`: None = 0, Owner = 1, UpdateAuthority = 2, Address(Pubkey) = 3.
const CORE_AUTHORITY_ADDRESS: u8 = 3;

// `PluginType`/`Plugin` discriminants that carry a freeze flag.
const CORE_PLUGIN_FREEZE_DELEGATE: u8 = 1;
const CORE_PLUGIN_PERMANENT_FREEZE_DELEGATE: u8 = 5;

/// Bounds-checked cursor over asset account bytes. Every read fails closed:
/// a truncated or malformed account is rejected, never partially trusted.
struct ByteCursor<'a> {
    data: &'a [u8],
    offset: usize,
}

impl<'a> ByteCursor<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, offset: 0 }
    }

    fn seek(&mut self, offset: usize) -> Result<()> {
        require!(
            offset <= self.data.len(),
            TycheError::InvalidFounderPassAsset
        );
        self.offset = offset;
        Ok(())
    }

    fn take(&mut self, len: usize) -> Result<&'a [u8]> {
        let end = self
            .offset
            .checked_add(len)
            .ok_or(TycheError::InvalidFounderPassAsset)?;
        require!(end <= self.data.len(), TycheError::InvalidFounderPassAsset);
        let slice = &self.data[self.offset..end];
        self.offset = end;
        Ok(slice)
    }

    fn read_u8(&mut self) -> Result<u8> {
        Ok(self.take(1)?[0])
    }

    fn read_u32(&mut self) -> Result<u32> {
        let bytes: [u8; 4] = self
            .take(4)?
            .try_into()
            .map_err(|_| error!(TycheError::InvalidFounderPassAsset))?;
        Ok(u32::from_le_bytes(bytes))
    }

    fn read_u64(&mut self) -> Result<u64> {
        let bytes: [u8; 8] = self
            .take(8)?
            .try_into()
            .map_err(|_| error!(TycheError::InvalidFounderPassAsset))?;
        Ok(u64::from_le_bytes(bytes))
    }

    fn read_pubkey(&mut self) -> Result<Pubkey> {
        let bytes: [u8; 32] = self
            .take(32)?
            .try_into()
            .map_err(|_| error!(TycheError::InvalidFounderPassAsset))?;
        Ok(Pubkey::new_from_array(bytes))
    }

    /// Skips a borsh `String` without interpreting its contents.
    fn skip_string(&mut self) -> Result<()> {
        let len = self.read_u32()? as usize;
        self.take(len)?;
        Ok(())
    }
}

/// Verifies that `asset` is an authentic, currently owned Founder Pass of the
/// configured standard, bound to the configured canonical collection.
///
/// `Unset` is not a standard and refuses everything, so an unconfigured
/// deployment cannot authorize a benefit (§14).
pub fn verify_founder_pass_asset(
    standard: FounderPassAssetStandard,
    expected_asset_program: &Pubkey,
    expected_collection: &Pubkey,
    expected_owner: &Pubkey,
    asset: &AccountInfo<'_>,
) -> Result<FounderPassAssetFacts> {
    match standard {
        FounderPassAssetStandard::Unset => Err(error!(TycheError::FounderPassAssetStandardUnset)),
        FounderPassAssetStandard::MetaplexCore => verify_metaplex_core_asset(
            expected_asset_program,
            expected_collection,
            expected_owner,
            asset,
        ),
    }
}

/// Metaplex Core `AssetV1` verifier.
///
/// The trust anchor is the account owner: the bytes are only interpreted after
/// the account is proved to be owned by the governed Core programme id, so a
/// forged look-alike account owned by any other programme is rejected before a
/// single field is read (§10).
///
/// FP-D2 caveat: Core is the §4.1 *provisional* standard and this decoder's
/// plugin discriminants must be re-verified against the exact deployed
/// Metaplex Core build during the FP0 freeze, before governance enables
/// benefits. The decoder fails closed on any structural ambiguity, and FP1
/// ships with benefits disabled, so an unverified numbering cannot authorize
/// anything.
fn verify_metaplex_core_asset(
    expected_asset_program: &Pubkey,
    expected_collection: &Pubkey,
    expected_owner: &Pubkey,
    asset: &AccountInfo<'_>,
) -> Result<FounderPassAssetFacts> {
    require!(
        *expected_asset_program != Pubkey::default() && *expected_collection != Pubkey::default(),
        TycheError::FounderPassAssetStandardUnset
    );
    require_keys_eq!(
        *asset.owner,
        *expected_asset_program,
        TycheError::InvalidFounderPassAssetProgram
    );

    let data = asset.try_borrow_data()?;
    let mut cursor = ByteCursor::new(&data);

    // A burned or uninitialized Core asset does not carry the AssetV1 key.
    require!(
        cursor.read_u8()? == CORE_KEY_ASSET_V1,
        TycheError::InvalidFounderPassAsset
    );

    let owner = cursor.read_pubkey()?;
    require_keys_eq!(owner, *expected_owner, TycheError::FounderPassNotOwned);

    // Collection binding is the update authority, not a metadata field.
    require!(
        cursor.read_u8()? == CORE_UPDATE_AUTHORITY_COLLECTION,
        TycheError::FounderPassCollectionMismatch
    );
    let collection = cursor.read_pubkey()?;
    require_keys_eq!(
        collection,
        *expected_collection,
        TycheError::FounderPassCollectionMismatch
    );

    // Name and URI are skipped structurally and never used as authorization
    // input (§6.2). `seq` is Option<u64>.
    cursor.skip_string()?;
    cursor.skip_string()?;
    if cursor.read_u8()? == 1 {
        cursor.read_u64()?;
    }

    require_founder_pass_not_frozen(&mut cursor)?;

    Ok(FounderPassAssetFacts {
        asset: asset.key(),
        owner,
        collection,
    })
}

/// Walks the Core plugin registry and rejects an asset that any freeze plugin
/// reports as frozen.
///
/// A frozen asset is escrowed, listed, or otherwise encumbered, so its recorded
/// owner is not a reliable current controller. §10 requires stale delegated or
/// frozen assets to be rejected rather than accepted on the owner field alone.
///
/// An asset with no plugin header at all is the common, valid case.
fn require_founder_pass_not_frozen(cursor: &mut ByteCursor<'_>) -> Result<()> {
    if cursor.offset == cursor.data.len() {
        return Ok(());
    }

    require!(
        cursor.read_u8()? == CORE_KEY_PLUGIN_HEADER_V1,
        TycheError::InvalidFounderPassAsset
    );
    let registry_offset = usize::try_from(cursor.read_u64()?)
        .map_err(|_| error!(TycheError::InvalidFounderPassAsset))?;

    cursor.seek(registry_offset)?;
    require!(
        cursor.read_u8()? == CORE_KEY_PLUGIN_REGISTRY_V1,
        TycheError::InvalidFounderPassAsset
    );

    let record_count = cursor.read_u32()? as usize;
    let mut freeze_offsets: Vec<(u8, usize)> = Vec::new();
    for _ in 0..record_count {
        let plugin_type = cursor.read_u8()?;
        match cursor.read_u8()? {
            CORE_AUTHORITY_ADDRESS => {
                cursor.read_pubkey()?;
            }
            0..=2 => {}
            // An authority discriminant this build does not know means the
            // registry layout is not the reviewed one: fail closed.
            _ => return Err(error!(TycheError::InvalidFounderPassAsset)),
        }
        let plugin_offset = usize::try_from(cursor.read_u64()?)
            .map_err(|_| error!(TycheError::InvalidFounderPassAsset))?;

        if plugin_type == CORE_PLUGIN_FREEZE_DELEGATE
            || plugin_type == CORE_PLUGIN_PERMANENT_FREEZE_DELEGATE
        {
            freeze_offsets.push((plugin_type, plugin_offset));
        }
    }

    for (plugin_type, plugin_offset) in freeze_offsets {
        cursor.seek(plugin_offset)?;
        // The serialized `Plugin` enum repeats its own discriminant. Requiring
        // it to agree with the registry record detects a registry that does not
        // describe the data it points at.
        require!(
            cursor.read_u8()? == plugin_type,
            TycheError::InvalidFounderPassAsset
        );
        let frozen = cursor.read_u8()?;
        require!(frozen <= 1, TycheError::InvalidFounderPassAsset);
        require!(frozen == 0, TycheError::FounderPassAssetFrozen);
    }

    Ok(())
}

// ------------------------------------------------------------------
// FP2 — fee-waiver settlement and concentration control (§8, §10)
// ------------------------------------------------------------------

/// Storage ceiling on the FP-D9 multiple-pass wallet policy.
///
/// This is a **layout** bound, not a policy default. `FounderPassWalletTurn`
/// records the distinct assets a wallet has already spent in a turn so that
/// "how many passes may one wallet use per turn" can be answered exactly rather
/// than from a counter that cannot tell a repeat from a new pass. Governance
/// still chooses the actual limit; it simply cannot choose one this layout
/// could not represent, and `validate_founder_pass_concentration_policy`
/// refuses a larger value instead of silently truncating it.
pub const FOUNDER_PASS_WALLET_TURN_PASS_SLOTS: usize = 8;

/// Which vote surface a pass-funded vote action lands on.
///
/// §3.2 counts approval and elimination votes against the same 1,000-action
/// quota, but they move different tallies, so the §10 concentration limit
/// tracks them separately: spending approval headroom on one rule must not
/// quietly consume that rule's elimination headroom.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FounderPassVoteKind {
    Approval,
    Elimination,
}

/// What a waived Tyche fee does to the SOL ledgers (§8).
///
/// `waived_fee_lamports` is what the player would otherwise have paid. It is
/// reported for the event and for economic analysis; it is never what the
/// action **records**, because §6.3 requires the recorded action fee to be
/// zero when waived.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FounderPassWaiverSettlement {
    pub waived_fee_lamports: u64,
    /// Lamports the sponsor vault must actually pay into the ordinary
    /// accounting path. Zero under `ReducedTurnPool`.
    pub sponsor_lamports: u64,
    pub treasury_lamports: u64,
    pub prize_lamports: u64,
}

/// Decides how one waived fee is funded, without moving a lamport.
///
/// §8 forbids booking a waived fee as collected SOL and requires exactly one
/// disclosed policy. Both are implemented here and neither is a default:
/// `Unset` refuses, so a deployment that has not resolved FP-D8 cannot waive
/// anything.
///
/// * `SponsorFunded` — the sponsor pays the otherwise-due amount into the
///   ordinary treasury/prize split, so the turn's economics are unchanged and
///   the ledgers reconcile exactly as for a paid action. §8 forbids charging a
///   sponsor an unbounded exponential fee "without an explicit funded limit and
///   rule": the funded limit is the vault's own spendable balance and the rule
///   is that a short vault **refuses the waiver** rather than silently
///   under-collecting or falling back to charging the player.
/// * `ReducedTurnPool` — nothing is paid and nothing is booked; the turn's
///   treasury and prize pool simply receive less, which is the disclosed cost
///   of the benefit.
///
/// An action whose ordinary fee is already zero never reaches a funding
/// decision: §8 says Tyche does not spend a pass credit to reproduce a zero
/// fee, so that case is refused here rather than charged to a quota.
pub fn plan_founder_pass_fee_waiver(
    funding: FounderPassFeeWaiverFunding,
    otherwise_due_lamports: u64,
    treasury_fee_bps: u16,
    sponsor_available_lamports: u64,
) -> Result<FounderPassWaiverSettlement> {
    require!(
        otherwise_due_lamports > 0,
        TycheError::FounderPassBenefitNotApplicable
    );

    match funding {
        FounderPassFeeWaiverFunding::Unset => {
            Err(error!(TycheError::FounderPassFeeWaiverFundingUnset))
        }
        FounderPassFeeWaiverFunding::SponsorFunded => {
            require!(
                sponsor_available_lamports >= otherwise_due_lamports,
                TycheError::FounderPassSponsorUnderfunded
            );
            let (treasury_lamports, prize_lamports) =
                crate::domain::split_fee(otherwise_due_lamports, treasury_fee_bps)?;
            Ok(FounderPassWaiverSettlement {
                waived_fee_lamports: otherwise_due_lamports,
                sponsor_lamports: otherwise_due_lamports,
                treasury_lamports,
                prize_lamports,
            })
        }
        FounderPassFeeWaiverFunding::ReducedTurnPool => Ok(FounderPassWaiverSettlement {
            waived_fee_lamports: otherwise_due_lamports,
            sponsor_lamports: 0,
            treasury_lamports: 0,
            prize_lamports: 0,
        }),
    }
}

/// Pins the governed FP-D9 parameters to what this layout can enforce.
///
/// Zero is the unresolved sentinel `founder_pass_unresolved_decisions` already
/// reports, so it is refused here too rather than read as "no limit".
pub fn validate_founder_pass_concentration_policy(
    max_pass_vote_actions_per_rule_per_turn: u16,
    max_passes_per_wallet_per_turn: u8,
) -> Result<()> {
    require!(
        max_pass_vote_actions_per_rule_per_turn > 0
            && u32::from(max_pass_vote_actions_per_rule_per_turn) <= FOUNDER_PASS_VOTE_ALLOWANCE,
        TycheError::InvalidFounderPassConcentrationLimit
    );
    require!(
        max_passes_per_wallet_per_turn > 0
            && usize::from(max_passes_per_wallet_per_turn) <= FOUNDER_PASS_WALLET_TURN_PASS_SLOTS,
        TycheError::InvalidFounderPassConcentrationLimit
    );
    Ok(())
}

/// Pass-funded vote actions one wallet has already aimed at one rule in one
/// turn.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct FounderPassVoteConcentrationView {
    pub approval_vote_actions: u16,
    pub elimination_vote_actions: u16,
}

/// Applies the §10 concentration limit to one pass-funded vote action.
///
/// The limit binds the **wallet**, not the pass. Binding it to the pass would
/// leave the abuse §10 names wide open: a wallet holding many passes could
/// rotate them and still aim thousands of fee-free votes at one finalist. This
/// is therefore where FP-D9's "multiple-pass wallet policy" takes effect for a
/// single rule; `plan_founder_pass_wallet_turn` bounds the turn as a whole.
pub fn plan_founder_pass_vote_concentration(
    view: &FounderPassVoteConcentrationView,
    kind: FounderPassVoteKind,
    max_pass_vote_actions_per_rule_per_turn: u16,
) -> Result<FounderPassVoteConcentrationView> {
    require!(
        max_pass_vote_actions_per_rule_per_turn > 0,
        TycheError::InvalidFounderPassConcentrationLimit
    );

    let mut next = *view;
    let counter = match kind {
        FounderPassVoteKind::Approval => &mut next.approval_vote_actions,
        FounderPassVoteKind::Elimination => &mut next.elimination_vote_actions,
    };
    require!(
        *counter < max_pass_vote_actions_per_rule_per_turn,
        TycheError::FounderPassVoteConcentrationExceeded
    );
    *counter = counter
        .checked_add(1)
        .ok_or(TycheError::ArithmeticOverflow)?;
    Ok(next)
}

/// The decided post-state of one wallet's per-turn pass admissions.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FounderPassWalletTurnPlan {
    /// The distinct assets this wallet has spent in this turn, after the use.
    pub assets: Vec<Pubkey>,
    /// True when this use admits a pass the wallet had not yet used this turn.
    pub newly_admitted: bool,
}

/// Applies FP-D9's multiple-pass wallet policy to one pass-funded action.
///
/// Re-using a pass the wallet already spent this turn is always allowed — the
/// limit is on how many **distinct** passes one wallet may draw on per turn,
/// not on how often it uses them, which the §3.2 quotas already bound.
pub fn plan_founder_pass_wallet_turn(
    assets: &[Pubkey],
    asset: Pubkey,
    max_passes_per_wallet_per_turn: u8,
) -> Result<FounderPassWalletTurnPlan> {
    require!(
        max_passes_per_wallet_per_turn > 0
            && usize::from(max_passes_per_wallet_per_turn) <= FOUNDER_PASS_WALLET_TURN_PASS_SLOTS,
        TycheError::InvalidFounderPassConcentrationLimit
    );
    require!(
        assets.len() <= usize::from(max_passes_per_wallet_per_turn),
        TycheError::InvalidFounderPassWalletTurn
    );

    if assets.contains(&asset) {
        return Ok(FounderPassWalletTurnPlan {
            assets: assets.to_vec(),
            newly_admitted: false,
        });
    }

    require!(
        assets.len() < usize::from(max_passes_per_wallet_per_turn),
        TycheError::FounderPassWalletPassLimitExceeded
    );
    let mut next = assets.to_vec();
    next.push(asset);
    Ok(FounderPassWalletTurnPlan {
        assets: next,
        newly_admitted: true,
    })
}
