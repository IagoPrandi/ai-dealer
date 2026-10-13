//! Native tests for the Founder Pass accounting core (FP1).
//!
//! These cover the §11 acceptance rows that FP1 is responsible for — Ownership,
//! Quotas, Turns, and the parts of Supply that are on-chain verification rather
//! than sale configuration. Benefit-consumption rows (Voting, Fees, JDR,
//! Concurrency, Migration) belong to FP2/FP3 and are not asserted here.

use anchor_lang::prelude::Pubkey;
use anchor_lang::Space;
use solana_account_info::AccountInfo;
use tyche::founder_pass::{
    founder_pass_turn_window, founder_pass_unresolved_decisions, plan_founder_pass_fee_waiver,
    plan_founder_pass_use, plan_founder_pass_vote_concentration, plan_founder_pass_wallet_turn,
    validate_founder_pass_allowances, validate_founder_pass_concentration_policy,
    validate_founder_pass_usage, verify_founder_pass_asset,
    FounderPassAssetStandard, FounderPassBenefit, FounderPassFeeWaiverFunding,
    FounderPassOwnershipSnapshotPolicy, FounderPassPolicy, FounderPassSupplyEnforcement,
    FounderPassTurnWindow, FounderPassUsageView, FounderPassVoteConcentrationView,
    FounderPassVoteKind, FOUNDER_PASS_WALLET_TURN_PASS_SLOTS,
    FP_DECISIONS_REQUIRED_FOR_ACTIVATION, FP_DECISION_ASSET_STANDARD,
    FP_DECISION_BOOSTABLE_REWARD_KINDS, FP_DECISION_CAMPAIGN, FP_DECISION_CANONICAL_COLLECTION,
    FP_DECISION_FEE_WAIVER_FUNDING, FP_DECISION_OWNERSHIP_SNAPSHOT, FP_DECISION_SUPPLY_ENFORCEMENT,
    FP_DECISION_VOTE_CONCENTRATION, FOUNDER_PASS_ACTIVE_TURN_WINDOW, FOUNDER_PASS_BET_ALLOWANCE,
    FOUNDER_PASS_MAX_SUPPLY, FOUNDER_PASS_RULE_PROPOSAL_ALLOWANCE, FOUNDER_PASS_VOTE_ALLOWANCE,
};
use tyche::{
    FounderPassSponsorVault, FounderPassVoteConcentration, FounderPassWalletTurn, TycheError,
};

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

/// The one global window, anchored at an activation turn of 7 unless a test
/// says otherwise.
const ANCHOR: u64 = 7;

fn window() -> FounderPassTurnWindow {
    founder_pass_turn_window(ANCHOR).unwrap()
}

fn fresh() -> FounderPassUsageView {
    FounderPassUsageView {
        vote_actions_used: 0,
        rule_proposals_used: 0,
        bets_used: 0,
    }
}

/// A usage view whose `benefit` counter sits at `used`.
fn at_counts(benefit: FounderPassBenefit, used: u32) -> FounderPassUsageView {
    let mut view = fresh();
    match benefit {
        FounderPassBenefit::Vote => view.vote_actions_used = used,
        FounderPassBenefit::RuleProposal => view.rule_proposals_used = used,
        FounderPassBenefit::Bet => view.bets_used = used,
        FounderPassBenefit::JdrBoost => {}
    }
    view
}

fn plan(
    view: &FounderPassUsageView,
    benefit: FounderPassBenefit,
    turn_id: u64,
) -> anchor_lang::Result<tyche::founder_pass::FounderPassUsePlan> {
    plan_founder_pass_use(view, window(), benefit, turn_id)
}

fn assert_error<T: std::fmt::Debug>(result: anchor_lang::Result<T>, expected: TycheError) {
    let expected_code = u32::from(expected);
    match result {
        Err(anchor_lang::error::Error::AnchorError(err)) => {
            assert_eq!(
                err.error_code_number, expected_code,
                "expected error code {expected_code}, got {}",
                err.error_code_number
            );
        }
        other => panic!("expected error code {expected_code}, got {other:?}"),
    }
}

/// Builds Metaplex Core `AssetV1` bytes:
/// `key | owner | update_authority | name | uri | seq`, optionally followed by
/// a plugin header, plugin data, and a plugin registry.
///
/// `plugins` is a list of `(registry_plugin_type, data_plugin_type, frozen)`.
/// Passing a different registry and data discriminant exercises the
/// consistency check that detects a registry not describing its own data.
fn core_asset_bytes(
    key: u8,
    owner: &Pubkey,
    update_authority_discriminant: u8,
    update_authority: &Pubkey,
    plugins: &[(u8, u8, u8)],
) -> Vec<u8> {
    let mut bytes = vec![key];
    bytes.extend_from_slice(owner.as_ref());
    bytes.push(update_authority_discriminant);
    bytes.extend_from_slice(update_authority.as_ref());

    let name = b"Tywish Founder Pass";
    bytes.extend_from_slice(&(name.len() as u32).to_le_bytes());
    bytes.extend_from_slice(name);
    let uri = b"https://example.invalid/pass.json";
    bytes.extend_from_slice(&(uri.len() as u32).to_le_bytes());
    bytes.extend_from_slice(uri);
    bytes.push(0); // seq: Option<u64>::None

    if plugins.is_empty() {
        return bytes;
    }

    // Plugin header is 9 bytes; plugin data follows it; the registry follows
    // the data.
    let data_start = bytes.len() + 9;
    let registry_offset = data_start + plugins.len() * 2;

    bytes.push(3); // PluginHeaderV1
    bytes.extend_from_slice(&(registry_offset as u64).to_le_bytes());
    for (_, data_plugin_type, frozen) in plugins {
        bytes.push(*data_plugin_type);
        bytes.push(*frozen);
    }

    bytes.push(4); // PluginRegistryV1
    bytes.extend_from_slice(&(plugins.len() as u32).to_le_bytes());
    for (index, (registry_plugin_type, _, _)) in plugins.iter().enumerate() {
        bytes.push(*registry_plugin_type);
        bytes.push(1); // Authority::Owner
        bytes.extend_from_slice(&((data_start + index * 2) as u64).to_le_bytes());
    }

    bytes
}

/// Runs the verifier over raw bytes owned by `account_owner`.
fn verify(
    standard: FounderPassAssetStandard,
    asset_program: &Pubkey,
    collection: &Pubkey,
    expected_owner: &Pubkey,
    account_owner: &Pubkey,
    mut bytes: Vec<u8>,
) -> anchor_lang::Result<tyche::founder_pass::FounderPassAssetFacts> {
    let asset_key = Pubkey::new_unique();
    let mut lamports = 1_000_000u64;
    let account = AccountInfo::new(
        &asset_key,
        false,
        false,
        &mut lamports,
        &mut bytes,
        account_owner,
        false,
        0,
    );
    verify_founder_pass_asset(standard, asset_program, collection, expected_owner, &account)
}

fn resolved_policy() -> FounderPassPolicy {
    FounderPassPolicy {
        asset_standard: FounderPassAssetStandard::MetaplexCore,
        asset_program_id: Pubkey::new_unique(),
        canonical_collection: Pubkey::new_unique(),
        campaign: Pubkey::new_unique(),
        max_supply: FOUNDER_PASS_MAX_SUPPLY,
        supply_enforcement: FounderPassSupplyEnforcement::CollectionHardCap,
        allowlist_commitment: [0u8; 32],
        ownership_snapshot_policy: FounderPassOwnershipSnapshotPolicy::ClaimTimeOwnership,
        boostable_reward_kinds: 0b11,
        fee_waiver_funding: FounderPassFeeWaiverFunding::SponsorFunded,
        max_pass_vote_actions_per_rule_per_turn: 3,
        max_passes_per_wallet_per_turn: 1,
    }
}

fn birth_policy() -> FounderPassPolicy {
    FounderPassPolicy {
        asset_standard: FounderPassAssetStandard::Unset,
        asset_program_id: Pubkey::default(),
        canonical_collection: Pubkey::default(),
        campaign: Pubkey::default(),
        max_supply: FOUNDER_PASS_MAX_SUPPLY,
        supply_enforcement: FounderPassSupplyEnforcement::Unset,
        allowlist_commitment: [0u8; 32],
        ownership_snapshot_policy: FounderPassOwnershipSnapshotPolicy::Unset,
        boostable_reward_kinds: 0,
        fee_waiver_funding: FounderPassFeeWaiverFunding::Unset,
        max_pass_vote_actions_per_rule_per_turn: 0,
        max_passes_per_wallet_per_turn: 0,
    }
}

// ------------------------------------------------------------------
// Account layout (§6.1, §6.2)
// ------------------------------------------------------------------

#[test]
fn founder_pass_account_sizes_are_explicit() {
    // 8 discriminator + 172 policy bytes.
    assert_eq!(8 + tyche::FounderPassConfig::INIT_SPACE, 180);
    // 8 discriminator + 79 bytes. The window is global, so this account holds
    // no turn state at all — only the three action counters.
    assert_eq!(8 + tyche::FounderPassUsage::INIT_SPACE, 87);
}

#[test]
fn founder_pass_pdas_are_canonical_and_asset_keyed() {
    let program_id = tyche::ID;
    let asset = Pubkey::new_unique();
    let other_asset = Pubkey::new_unique();

    let (config, _) = Pubkey::find_program_address(&[b"founder_pass_config"], &program_id);
    let (usage, _) =
        Pubkey::find_program_address(&[b"founder_pass_usage", asset.as_ref()], &program_id);
    let (other_usage, _) =
        Pubkey::find_program_address(&[b"founder_pass_usage", other_asset.as_ref()], &program_id);

    assert_ne!(config, usage);
    // Usage is keyed by the individual asset, so two passes never share a
    // quota account (§3.2).
    assert_ne!(usage, other_usage);
}

// ------------------------------------------------------------------
// Global active-turn window (800 consecutive turns from the activation turn)
// ------------------------------------------------------------------

#[test]
fn the_window_is_anchored_at_the_activation_turn_for_every_pass() {
    let w = founder_pass_turn_window(ANCHOR).unwrap();
    assert_eq!(w.start_turn_id, ANCHOR);
    assert_eq!(
        w.end_turn_id,
        ANCHOR + u64::from(FOUNDER_PASS_ACTIVE_TURN_WINDOW) - 1
    );

    // It does not depend on the pass: a brand new pass and a heavily used one
    // are judged against exactly the same bounds.
    let heavily_used = FounderPassUsageView {
        vote_actions_used: 999,
        rule_proposals_used: 99,
        bets_used: 49,
    };
    assert_eq!(
        plan(&fresh(), FounderPassBenefit::Vote, 500).unwrap().window,
        plan(&heavily_used, FounderPassBenefit::Vote, 500)
            .unwrap()
            .window
    );
}

#[test]
fn using_a_benefit_never_moves_the_window() {
    // The owner's simplification: a holder chooses whether to spend a benefit,
    // never when the clock runs. Nothing a pass does shifts its own bounds.
    let w = window();
    for view in [fresh(), at_counts(FounderPassBenefit::Vote, 500)] {
        for turn in [ANCHOR, ANCHOR + 1, 400, w.end_turn_id] {
            let p = plan(&view, FounderPassBenefit::Vote, turn).unwrap();
            assert_eq!(p.window, w, "turn {turn} must not move the window");
        }
    }
}

#[test]
fn the_window_is_inclusive_at_both_ends_and_closed_beyond_them() {
    let w = window();

    plan(&fresh(), FounderPassBenefit::Vote, w.start_turn_id).unwrap();
    plan(&fresh(), FounderPassBenefit::Vote, w.end_turn_id).unwrap();

    // One turn past the end closes every pass at once, quota intact.
    assert_error(
        plan(&fresh(), FounderPassBenefit::Vote, w.end_turn_id + 1),
        TycheError::FounderPassTurnWindowClosed,
    );

    // A turn before activation is equally out of range. This is the case a late
    // JDR claim hits when its originating turn precedes activation.
    assert_error(
        plan(&fresh(), FounderPassBenefit::JdrBoost, ANCHOR - 1),
        TycheError::FounderPassTurnWindowClosed,
    );
}

#[test]
fn exactly_eight_hundred_turns_are_covered() {
    let covered = (1..=2_000u64)
        .filter(|turn| plan(&fresh(), FounderPassBenefit::Vote, *turn).is_ok())
        .count();
    assert_eq!(covered, FOUNDER_PASS_ACTIVE_TURN_WINDOW as usize);
}

#[test]
fn a_pass_that_arrives_late_inherits_only_the_remainder() {
    // Consequence of the global anchor the owner chose: quotas are identical
    // across passes, but realized value depends on when a pass starts being
    // used. A pass first used at the final turn has one turn left.
    let w = window();
    plan(&fresh(), FounderPassBenefit::Bet, w.end_turn_id).unwrap();
    assert_error(
        plan(&fresh(), FounderPassBenefit::Bet, w.end_turn_id + 1),
        TycheError::FounderPassTurnWindowClosed,
    );
}

#[test]
fn an_unactivated_deployment_has_no_window_at_all() {
    // activation_turn_id is zero until governance activates, so there is no
    // window to be inside and nothing is eligible.
    assert_error(
        founder_pass_turn_window(0),
        TycheError::FounderPassTurnWindowClosed,
    );
}

#[test]
fn the_window_is_checked_before_the_action_quota() {
    // Both budgets are spent; the window is the governing refusal, so the
    // reported reason is not a quota that no longer matters.
    let spent = at_counts(FounderPassBenefit::Vote, FOUNDER_PASS_VOTE_ALLOWANCE);
    assert_error(
        plan(&spent, FounderPassBenefit::Vote, 5_000),
        TycheError::FounderPassTurnWindowClosed,
    );
}

#[test]
fn turn_zero_is_rejected() {
    assert_error(
        plan(&fresh(), FounderPassBenefit::Vote, 0),
        TycheError::InvalidTurnId,
    );
}

#[test]
fn an_anchor_near_the_representable_limit_does_not_wrap() {
    // u64::MAX + 799 overflows; the window must fail rather than wrap its end
    // around to a small number that would accept arbitrary turns.
    assert_error(
        founder_pass_turn_window(u64::MAX),
        TycheError::ArithmeticOverflow,
    );
}

// ------------------------------------------------------------------
// §3.2 per-pass allowances
// ------------------------------------------------------------------

#[test]
fn last_allowed_action_succeeds_and_the_next_one_fails() {
    let cases: [(FounderPassBenefit, u32, TycheError); 3] = [
        (
            FounderPassBenefit::Vote,
            FOUNDER_PASS_VOTE_ALLOWANCE,
            TycheError::FounderPassVoteAllowanceExhausted,
        ),
        (
            FounderPassBenefit::RuleProposal,
            FOUNDER_PASS_RULE_PROPOSAL_ALLOWANCE,
            TycheError::FounderPassProposalAllowanceExhausted,
        ),
        (
            FounderPassBenefit::Bet,
            FOUNDER_PASS_BET_ALLOWANCE,
            TycheError::FounderPassBetAllowanceExhausted,
        ),
    ];

    for (benefit, allowance, expected) in cases {
        let p = plan(&at_counts(benefit, allowance - 1), benefit, 42).unwrap();
        let reached = match benefit {
            FounderPassBenefit::Vote => p.vote_actions_used,
            FounderPassBenefit::RuleProposal => p.rule_proposals_used,
            FounderPassBenefit::Bet => p.bets_used,
            FounderPassBenefit::JdrBoost => unreachable!(),
        };
        assert_eq!(reached, allowance, "{benefit:?} should reach its allowance");

        assert_error(plan(&at_counts(benefit, allowance), benefit, 42), expected);
    }
}

#[test]
fn action_quotas_are_independent_and_jdr_boost_consumes_none() {
    let usage = FounderPassUsageView {
        vote_actions_used: 11,
        rule_proposals_used: 22,
        bets_used: 33,
    };

    let vote = plan(&usage, FounderPassBenefit::Vote, 42).unwrap();
    assert_eq!(
        (
            vote.vote_actions_used,
            vote.rule_proposals_used,
            vote.bets_used
        ),
        (12, 22, 33)
    );

    // §3.2 gives the JDR boost no lifetime action quota.
    let boost = plan(&usage, FounderPassBenefit::JdrBoost, 42).unwrap();
    assert_eq!(
        (
            boost.vote_actions_used,
            boost.rule_proposals_used,
            boost.bets_used
        ),
        (11, 22, 33)
    );
}

#[test]
fn an_exhausted_pass_still_exhausts_only_its_own_benefit() {
    let no_bets_left = at_counts(FounderPassBenefit::Bet, FOUNDER_PASS_BET_ALLOWANCE);

    assert_error(
        plan(&no_bets_left, FounderPassBenefit::Bet, 42),
        TycheError::FounderPassBetAllowanceExhausted,
    );
    plan(&no_bets_left, FounderPassBenefit::Vote, 42).unwrap();
    plan(&no_bets_left, FounderPassBenefit::RuleProposal, 42).unwrap();
}

// ------------------------------------------------------------------
// §6.2 representation invariant
// ------------------------------------------------------------------

#[test]
fn counters_above_their_allowance_are_rejected() {
    let over = FounderPassUsageView {
        vote_actions_used: FOUNDER_PASS_VOTE_ALLOWANCE + 1,
        rule_proposals_used: 0,
        bets_used: 0,
    };
    assert_error(
        validate_founder_pass_usage(&over),
        TycheError::InvalidFounderPassUsage,
    );
    assert_error(
        plan(&over, FounderPassBenefit::Vote, 42),
        TycheError::InvalidFounderPassUsage,
    );
}

#[test]
fn a_fresh_and_a_used_account_both_validate() {
    validate_founder_pass_usage(&fresh()).unwrap();
    validate_founder_pass_usage(&at_counts(FounderPassBenefit::Vote, 500)).unwrap();
}

#[test]
fn planning_a_refused_use_changes_nothing() {
    // §3.3: "A failed or reverted action consumes neither quota nor turn."
    // The planner is pure, so a refusal cannot have written anything.
    let view = at_counts(FounderPassBenefit::Bet, 10);
    let before = view;

    assert!(plan(&view, FounderPassBenefit::Bet, 100_000).is_err());
    assert_eq!(view, before);
}

// ------------------------------------------------------------------
// §3.1/§3.2 allowance pinning
// ------------------------------------------------------------------

#[test]
fn stored_allowances_are_pinned_to_the_confirmed_product_limits() {
    validate_founder_pass_allowances(
        FOUNDER_PASS_VOTE_ALLOWANCE,
        FOUNDER_PASS_RULE_PROPOSAL_ALLOWANCE,
        FOUNDER_PASS_BET_ALLOWANCE,
        FOUNDER_PASS_ACTIVE_TURN_WINDOW,
    )
    .unwrap();

    // Governance cannot widen a confirmed limit through the config account.
    for widened in [
        (
            FOUNDER_PASS_VOTE_ALLOWANCE + 1,
            FOUNDER_PASS_RULE_PROPOSAL_ALLOWANCE,
            FOUNDER_PASS_BET_ALLOWANCE,
            FOUNDER_PASS_ACTIVE_TURN_WINDOW,
        ),
        (
            FOUNDER_PASS_VOTE_ALLOWANCE,
            FOUNDER_PASS_RULE_PROPOSAL_ALLOWANCE + 1,
            FOUNDER_PASS_BET_ALLOWANCE,
            FOUNDER_PASS_ACTIVE_TURN_WINDOW,
        ),
        (
            FOUNDER_PASS_VOTE_ALLOWANCE,
            FOUNDER_PASS_RULE_PROPOSAL_ALLOWANCE,
            FOUNDER_PASS_BET_ALLOWANCE + 1,
            FOUNDER_PASS_ACTIVE_TURN_WINDOW,
        ),
        (
            FOUNDER_PASS_VOTE_ALLOWANCE,
            FOUNDER_PASS_RULE_PROPOSAL_ALLOWANCE,
            FOUNDER_PASS_BET_ALLOWANCE,
            FOUNDER_PASS_ACTIVE_TURN_WINDOW + 1,
        ),
    ] {
        assert_error(
            validate_founder_pass_allowances(widened.0, widened.1, widened.2, widened.3),
            TycheError::InvalidFounderPassAllowance,
        );
    }
}

// ------------------------------------------------------------------
// §14 decision gating
// ------------------------------------------------------------------

#[test]
fn a_newly_created_config_reports_every_decision_unresolved() {
    assert_eq!(
        founder_pass_unresolved_decisions(&birth_policy()),
        FP_DECISIONS_REQUIRED_FOR_ACTIVATION
    );
}

#[test]
fn a_fully_governed_policy_reports_no_unresolved_decision() {
    assert_eq!(founder_pass_unresolved_decisions(&resolved_policy()), 0);
}

#[test]
fn each_unresolved_decision_raises_exactly_its_own_bit() {
    type DecisionCase = (&'static str, fn(&mut FounderPassPolicy), u16);

    let cases: [DecisionCase; 8] = [
        (
            "FP-D2 standard",
            |p| p.asset_standard = FounderPassAssetStandard::Unset,
            FP_DECISION_ASSET_STANDARD,
        ),
        (
            "FP-D2 programme id",
            |p| p.asset_program_id = Pubkey::default(),
            FP_DECISION_ASSET_STANDARD,
        ),
        (
            "FP-D2 collection",
            |p| p.canonical_collection = Pubkey::default(),
            FP_DECISION_CANONICAL_COLLECTION,
        ),
        (
            "FP-D2 supply proof",
            |p| p.supply_enforcement = FounderPassSupplyEnforcement::Unset,
            FP_DECISION_SUPPLY_ENFORCEMENT,
        ),
        ("campaign", |p| p.campaign = Pubkey::default(), FP_DECISION_CAMPAIGN),
        (
            "FP-D6 ownership",
            |p| p.ownership_snapshot_policy = FounderPassOwnershipSnapshotPolicy::Unset,
            FP_DECISION_OWNERSHIP_SNAPSHOT,
        ),
        (
            "FP-D7 reward kinds",
            |p| p.boostable_reward_kinds = 0,
            FP_DECISION_BOOSTABLE_REWARD_KINDS,
        ),
        (
            "FP-D8 fee funding",
            |p| p.fee_waiver_funding = FounderPassFeeWaiverFunding::Unset,
            FP_DECISION_FEE_WAIVER_FUNDING,
        ),
    ];

    for (label, mutate, expected_bit) in cases {
        let mut policy = resolved_policy();
        mutate(&mut policy);
        assert_eq!(
            founder_pass_unresolved_decisions(&policy),
            expected_bit,
            "{label} should raise exactly its own bit"
        );
    }
}

#[test]
fn either_half_of_the_concentration_policy_blocks_activation() {
    // FP-D9 covers both the per-rule limit and the multiple-pass wallet rule.
    for mutate in [
        (|p: &mut FounderPassPolicy| p.max_pass_vote_actions_per_rule_per_turn = 0)
            as fn(&mut FounderPassPolicy),
        |p: &mut FounderPassPolicy| p.max_passes_per_wallet_per_turn = 0,
    ] {
        let mut policy = resolved_policy();
        mutate(&mut policy);
        assert_eq!(
            founder_pass_unresolved_decisions(&policy),
            FP_DECISION_VOTE_CONCENTRATION
        );
    }
}

#[test]
fn an_allowlist_commitment_mode_needs_an_actual_commitment() {
    let mut policy = resolved_policy();
    policy.supply_enforcement = FounderPassSupplyEnforcement::AllowlistCommitment;
    policy.allowlist_commitment = [0u8; 32];
    assert_eq!(
        founder_pass_unresolved_decisions(&policy),
        FP_DECISION_SUPPLY_ENFORCEMENT,
        "an all-zero commitment is unresolved, not an empty allowlist"
    );

    policy.allowlist_commitment = [7u8; 32];
    assert_eq!(founder_pass_unresolved_decisions(&policy), 0);
}

#[test]
fn a_supply_cap_other_than_five_thousand_blocks_activation() {
    let mut policy = resolved_policy();
    policy.max_supply = FOUNDER_PASS_MAX_SUPPLY + 1;
    assert_eq!(
        founder_pass_unresolved_decisions(&policy),
        FP_DECISION_SUPPLY_ENFORCEMENT
    );
}

// ------------------------------------------------------------------
// §6.2/§10 asset verification
// ------------------------------------------------------------------

#[test]
fn a_genuine_current_owner_and_collection_pass_verification() {
    let core = Pubkey::new_unique();
    let collection = Pubkey::new_unique();
    let owner = Pubkey::new_unique();

    let facts = verify(
        FounderPassAssetStandard::MetaplexCore,
        &core,
        &collection,
        &owner,
        &core,
        core_asset_bytes(1, &owner, 2, &collection, &[]),
    )
    .unwrap();

    assert_eq!(facts.owner, owner);
    assert_eq!(facts.collection, collection);
}

#[test]
fn an_unset_standard_authorizes_nothing() {
    let core = Pubkey::new_unique();
    let collection = Pubkey::new_unique();
    let owner = Pubkey::new_unique();

    assert_error(
        verify(
            FounderPassAssetStandard::Unset,
            &core,
            &collection,
            &owner,
            &core,
            core_asset_bytes(1, &owner, 2, &collection, &[]),
        ),
        TycheError::FounderPassAssetStandardUnset,
    );
}

#[test]
fn an_unconfigured_programme_or_collection_authorizes_nothing() {
    let core = Pubkey::new_unique();
    let collection = Pubkey::new_unique();
    let owner = Pubkey::new_unique();
    let bytes = core_asset_bytes(1, &owner, 2, &collection, &[]);

    assert_error(
        verify(
            FounderPassAssetStandard::MetaplexCore,
            &Pubkey::default(),
            &collection,
            &owner,
            &core,
            bytes.clone(),
        ),
        TycheError::FounderPassAssetStandardUnset,
    );
    assert_error(
        verify(
            FounderPassAssetStandard::MetaplexCore,
            &core,
            &Pubkey::default(),
            &owner,
            &core,
            bytes,
        ),
        TycheError::FounderPassAssetStandardUnset,
    );
}

#[test]
fn an_asset_owned_by_another_programme_is_rejected_before_its_bytes_are_read() {
    let core = Pubkey::new_unique();
    let impostor_program = Pubkey::new_unique();
    let collection = Pubkey::new_unique();
    let owner = Pubkey::new_unique();

    // The bytes are a perfectly well-formed pass; only the account owner lies.
    assert_error(
        verify(
            FounderPassAssetStandard::MetaplexCore,
            &core,
            &collection,
            &owner,
            &impostor_program,
            core_asset_bytes(1, &owner, 2, &collection, &[]),
        ),
        TycheError::InvalidFounderPassAssetProgram,
    );
}

#[test]
fn a_burned_or_wrong_kind_account_is_rejected() {
    let core = Pubkey::new_unique();
    let collection = Pubkey::new_unique();
    let owner = Pubkey::new_unique();

    // Key 0 is Uninitialized (a burned asset), key 5 is a CollectionV1.
    for key in [0u8, 5u8] {
        assert_error(
            verify(
                FounderPassAssetStandard::MetaplexCore,
                &core,
                &collection,
                &owner,
                &core,
                core_asset_bytes(key, &owner, 2, &collection, &[]),
            ),
            TycheError::InvalidFounderPassAsset,
        );
    }
}

#[test]
fn a_post_transfer_stale_owner_is_rejected() {
    let core = Pubkey::new_unique();
    let collection = Pubkey::new_unique();
    let new_owner = Pubkey::new_unique();
    let previous_owner = Pubkey::new_unique();

    // The asset now records `new_owner`; the previous owner still signs.
    assert_error(
        verify(
            FounderPassAssetStandard::MetaplexCore,
            &core,
            &collection,
            &previous_owner,
            &core,
            core_asset_bytes(1, &new_owner, 2, &collection, &[]),
        ),
        TycheError::FounderPassNotOwned,
    );
}

#[test]
fn a_wrong_or_unbound_collection_is_rejected() {
    let core = Pubkey::new_unique();
    let collection = Pubkey::new_unique();
    let spoofed = Pubkey::new_unique();
    let owner = Pubkey::new_unique();

    // Right shape, wrong collection.
    assert_error(
        verify(
            FounderPassAssetStandard::MetaplexCore,
            &core,
            &collection,
            &owner,
            &core,
            core_asset_bytes(1, &owner, 2, &spoofed, &[]),
        ),
        TycheError::FounderPassCollectionMismatch,
    );

    // UpdateAuthority::Address (1) and ::None (0) are not a collection
    // binding, even when the bytes that follow happen to be the right key.
    for discriminant in [0u8, 1u8] {
        assert_error(
            verify(
                FounderPassAssetStandard::MetaplexCore,
                &core,
                &collection,
                &owner,
                &core,
                core_asset_bytes(1, &owner, discriminant, &collection, &[]),
            ),
            TycheError::FounderPassCollectionMismatch,
        );
    }
}

#[test]
fn truncated_asset_data_is_rejected_rather_than_partially_trusted() {
    let core = Pubkey::new_unique();
    let collection = Pubkey::new_unique();
    let owner = Pubkey::new_unique();
    let full = core_asset_bytes(1, &owner, 2, &collection, &[]);

    // Every truncation after the collection binding must fail closed.
    for len in 66..full.len() {
        let truncated = full[..len].to_vec();
        assert_error(
            verify(
                FounderPassAssetStandard::MetaplexCore,
                &core,
                &collection,
                &owner,
                &core,
                truncated,
            ),
            TycheError::InvalidFounderPassAsset,
        );
    }

    // An empty account has no key byte at all.
    assert_error(
        verify(
            FounderPassAssetStandard::MetaplexCore,
            &core,
            &collection,
            &owner,
            &core,
            Vec::new(),
        ),
        TycheError::InvalidFounderPassAsset,
    );
}

#[test]
fn a_frozen_asset_is_rejected_and_an_unfrozen_one_is_not() {
    let core = Pubkey::new_unique();
    let collection = Pubkey::new_unique();
    let owner = Pubkey::new_unique();

    // FreezeDelegate (1) and PermanentFreezeDelegate (5).
    for plugin_type in [1u8, 5u8] {
        assert_error(
            verify(
                FounderPassAssetStandard::MetaplexCore,
                &core,
                &collection,
                &owner,
                &core,
                core_asset_bytes(1, &owner, 2, &collection, &[(plugin_type, plugin_type, 1)]),
            ),
            TycheError::FounderPassAssetFrozen,
        );

        verify(
            FounderPassAssetStandard::MetaplexCore,
            &core,
            &collection,
            &owner,
            &core,
            core_asset_bytes(1, &owner, 2, &collection, &[(plugin_type, plugin_type, 0)]),
        )
        .unwrap();
    }
}

#[test]
fn a_freeze_plugin_behind_other_plugins_is_still_found() {
    let core = Pubkey::new_unique();
    let collection = Pubkey::new_unique();
    let owner = Pubkey::new_unique();

    // Royalties (0), Attributes (6), then a frozen FreezeDelegate (1).
    assert_error(
        verify(
            FounderPassAssetStandard::MetaplexCore,
            &core,
            &collection,
            &owner,
            &core,
            core_asset_bytes(
                1,
                &owner,
                2,
                &collection,
                &[(0, 0, 0), (6, 6, 0), (1, 1, 1)],
            ),
        ),
        TycheError::FounderPassAssetFrozen,
    );
}

#[test]
fn a_registry_that_does_not_describe_its_own_plugin_data_is_rejected() {
    let core = Pubkey::new_unique();
    let collection = Pubkey::new_unique();
    let owner = Pubkey::new_unique();

    // The registry claims a FreezeDelegate (1) but the data at that offset
    // carries a different discriminant, so the frozen byte cannot be trusted.
    assert_error(
        verify(
            FounderPassAssetStandard::MetaplexCore,
            &core,
            &collection,
            &owner,
            &core,
            core_asset_bytes(1, &owner, 2, &collection, &[(1, 4, 0)]),
        ),
        TycheError::InvalidFounderPassAsset,
    );
}

#[test]
fn a_malformed_plugin_header_or_registry_is_rejected() {
    let core = Pubkey::new_unique();
    let collection = Pubkey::new_unique();
    let owner = Pubkey::new_unique();
    let base_len = core_asset_bytes(1, &owner, 2, &collection, &[]).len();

    // Trailing bytes that are not a plugin header.
    let mut wrong_header = core_asset_bytes(1, &owner, 2, &collection, &[]);
    wrong_header.push(9);
    assert_error(
        verify(
            FounderPassAssetStandard::MetaplexCore,
            &core,
            &collection,
            &owner,
            &core,
            wrong_header,
        ),
        TycheError::InvalidFounderPassAsset,
    );

    // A header whose registry offset points past the end of the account.
    let mut wild_offset = core_asset_bytes(1, &owner, 2, &collection, &[]);
    wild_offset.push(3);
    wild_offset.extend_from_slice(&u64::MAX.to_le_bytes());
    assert_error(
        verify(
            FounderPassAssetStandard::MetaplexCore,
            &core,
            &collection,
            &owner,
            &core,
            wild_offset,
        ),
        TycheError::InvalidFounderPassAsset,
    );

    // A header pointing at bytes that are not a plugin registry.
    let mut wrong_registry = core_asset_bytes(1, &owner, 2, &collection, &[]);
    wrong_registry.push(3);
    wrong_registry.extend_from_slice(&((base_len + 9) as u64).to_le_bytes());
    wrong_registry.push(7);
    assert_error(
        verify(
            FounderPassAssetStandard::MetaplexCore,
            &core,
            &collection,
            &owner,
            &core,
            wrong_registry,
        ),
        TycheError::InvalidFounderPassAsset,
    );

    // An unknown authority discriminant means the layout is not the reviewed
    // one, so the record must not be skipped over.
    let mut unknown_authority = core_asset_bytes(1, &owner, 2, &collection, &[]);
    let registry_offset = unknown_authority.len() + 9;
    unknown_authority.push(3);
    unknown_authority.extend_from_slice(&(registry_offset as u64).to_le_bytes());
    unknown_authority.push(4);
    unknown_authority.extend_from_slice(&1u32.to_le_bytes());
    unknown_authority.push(1);
    unknown_authority.push(9); // not a known Authority variant
    unknown_authority.extend_from_slice(&0u64.to_le_bytes());
    assert_error(
        verify(
            FounderPassAssetStandard::MetaplexCore,
            &core,
            &collection,
            &owner,
            &core,
            unknown_authority,
        ),
        TycheError::InvalidFounderPassAsset,
    );
}

// ==================================================================
// FP2 — fee waivers and concentration control (§8, §10)
//
// Covers the §11 acceptance rows FP2 is responsible for: Fees (whole fee
// waived, normal free actions consume no credit, ledgers reconcile under the
// chosen funding policy) and the concentration half of Voting.
// ==================================================================

const TREASURY_BPS: u16 = 2_500;

// ---------- Fees ----------

#[test]
fn a_sponsor_funded_waiver_books_exactly_what_a_paid_action_would_have() {
    let settlement = plan_founder_pass_fee_waiver(
        FounderPassFeeWaiverFunding::SponsorFunded,
        1_000_000,
        TREASURY_BPS,
        1_000_000,
    )
    .unwrap();

    assert_eq!(settlement.waived_fee_lamports, 1_000_000);
    assert_eq!(settlement.sponsor_lamports, 1_000_000);
    // The split must be identical to the ordinary paid path, or the turn's SOL
    // ledgers would not reconcile (§11 "Fees").
    let (treasury, prize) = tyche::domain::split_fee(1_000_000, TREASURY_BPS).unwrap();
    assert_eq!(settlement.treasury_lamports, treasury);
    assert_eq!(settlement.prize_lamports, prize);
    assert_eq!(
        settlement.treasury_lamports + settlement.prize_lamports,
        settlement.sponsor_lamports
    );
}

#[test]
fn a_reduced_pool_waiver_books_nothing_at_all() {
    let settlement = plan_founder_pass_fee_waiver(
        FounderPassFeeWaiverFunding::ReducedTurnPool,
        1_000_000,
        TREASURY_BPS,
        0,
    )
    .unwrap();

    // §8: a waived fee cannot be booked as collected SOL. Under this policy
    // nobody paid, so nothing is credited anywhere.
    assert_eq!(settlement.waived_fee_lamports, 1_000_000);
    assert_eq!(settlement.sponsor_lamports, 0);
    assert_eq!(settlement.treasury_lamports, 0);
    assert_eq!(settlement.prize_lamports, 0);
}

#[test]
fn an_unresolved_funding_policy_cannot_waive_anything() {
    assert_error(
        plan_founder_pass_fee_waiver(
            FounderPassFeeWaiverFunding::Unset,
            1_000_000,
            TREASURY_BPS,
            u64::MAX,
        ),
        TycheError::FounderPassFeeWaiverFundingUnset,
    );
}

#[test]
fn a_short_sponsor_refuses_the_waiver_instead_of_under_collecting() {
    // §8 requires an explicit funded limit. One lamport short must fail, not
    // silently book a smaller amount and not fall back to charging the player.
    assert_error(
        plan_founder_pass_fee_waiver(
            FounderPassFeeWaiverFunding::SponsorFunded,
            1_000_000,
            TREASURY_BPS,
            999_999,
        ),
        TycheError::FounderPassSponsorUnderfunded,
    );
    // Exactly enough is enough.
    assert!(plan_founder_pass_fee_waiver(
        FounderPassFeeWaiverFunding::SponsorFunded,
        1_000_000,
        TREASURY_BPS,
        1_000_000,
    )
    .is_ok());
}

#[test]
fn an_already_free_action_does_not_spend_a_pass_credit() {
    // §8: "When the ordinary action fee is zero, Tyche does not spend a pass
    // credit merely to reproduce the same zero fee." Refused under every
    // funding policy, including the ones that would otherwise succeed.
    for funding in [
        FounderPassFeeWaiverFunding::SponsorFunded,
        FounderPassFeeWaiverFunding::ReducedTurnPool,
        FounderPassFeeWaiverFunding::Unset,
    ] {
        assert_error(
            plan_founder_pass_fee_waiver(funding, 0, TREASURY_BPS, u64::MAX),
            TycheError::FounderPassBenefitNotApplicable,
        );
    }
}

#[test]
fn an_escalated_repeat_fee_is_waived_in_full() {
    // §8 waives the *entire* otherwise-due fee "including a repeated-action
    // escalated fee", so a large escalated amount must settle exactly, not be
    // capped at some base.
    let escalated = 64_000_000u64;
    let settlement = plan_founder_pass_fee_waiver(
        FounderPassFeeWaiverFunding::SponsorFunded,
        escalated,
        TREASURY_BPS,
        escalated,
    )
    .unwrap();
    assert_eq!(settlement.waived_fee_lamports, escalated);
    assert_eq!(
        settlement.treasury_lamports + settlement.prize_lamports,
        escalated
    );
}

// ---------- Vote concentration (§10, FP-D9) ----------

#[test]
fn approval_and_elimination_headroom_are_tracked_separately() {
    let view = FounderPassVoteConcentrationView::default();
    let after_approval =
        plan_founder_pass_vote_concentration(&view, FounderPassVoteKind::Approval, 2).unwrap();
    assert_eq!(after_approval.approval_vote_actions, 1);
    // Spending approval headroom must not consume elimination headroom.
    assert_eq!(after_approval.elimination_vote_actions, 0);

    let after_elimination = plan_founder_pass_vote_concentration(
        &after_approval,
        FounderPassVoteKind::Elimination,
        2,
    )
    .unwrap();
    assert_eq!(after_elimination.approval_vote_actions, 1);
    assert_eq!(after_elimination.elimination_vote_actions, 1);
}

#[test]
fn the_last_allowed_vote_on_a_rule_succeeds_and_the_next_fails() {
    let limit = 3u16;
    let mut view = FounderPassVoteConcentrationView::default();
    for expected in 1..=limit {
        view = plan_founder_pass_vote_concentration(&view, FounderPassVoteKind::Approval, limit)
            .unwrap();
        assert_eq!(view.approval_vote_actions, expected);
    }
    assert_error(
        plan_founder_pass_vote_concentration(&view, FounderPassVoteKind::Approval, limit),
        TycheError::FounderPassVoteConcentrationExceeded,
    );
    // The other surface is untouched by the exhausted one.
    assert!(
        plan_founder_pass_vote_concentration(&view, FounderPassVoteKind::Elimination, limit)
            .is_ok()
    );
}

#[test]
fn a_zero_concentration_limit_is_unresolved_not_unlimited() {
    assert_error(
        plan_founder_pass_vote_concentration(
            &FounderPassVoteConcentrationView::default(),
            FounderPassVoteKind::Approval,
            0,
        ),
        TycheError::InvalidFounderPassConcentrationLimit,
    );
}

#[test]
fn a_refused_vote_concentration_plan_changes_nothing() {
    let view = FounderPassVoteConcentrationView {
        approval_vote_actions: 1,
        elimination_vote_actions: 0,
    };
    let before = view;
    assert!(
        plan_founder_pass_vote_concentration(&view, FounderPassVoteKind::Approval, 1).is_err()
    );
    assert_eq!(view, before);
}

// ---------- Multiple-pass wallet policy (§10, FP-D9) ----------

#[test]
fn reusing_a_pass_already_spent_this_turn_admits_nothing_new() {
    let asset = Pubkey::new_unique();
    let plan = plan_founder_pass_wallet_turn(&[asset], asset, 1).unwrap();
    // Re-use is always allowed; the limit counts distinct passes, and the §3.2
    // quotas already bound how often each one is used.
    assert!(!plan.newly_admitted);
    assert_eq!(plan.assets, vec![asset]);
}

#[test]
fn a_wallet_cannot_rotate_more_passes_than_its_per_turn_limit() {
    let first = Pubkey::new_unique();
    let second = Pubkey::new_unique();

    let after_first = plan_founder_pass_wallet_turn(&[], first, 1).unwrap();
    assert!(after_first.newly_admitted);
    assert_eq!(after_first.assets, vec![first]);

    assert_error(
        plan_founder_pass_wallet_turn(&after_first.assets, second, 1),
        TycheError::FounderPassWalletPassLimitExceeded,
    );
    // Raising the governed limit admits the second pass.
    let after_second = plan_founder_pass_wallet_turn(&after_first.assets, second, 2).unwrap();
    assert_eq!(after_second.assets, vec![first, second]);
}

#[test]
fn the_wallet_turn_limit_is_honoured_exactly_at_its_boundary() {
    let assets: Vec<Pubkey> = (0..3).map(|_| Pubkey::new_unique()).collect();
    let third = assets[2];
    // Two spent, limit three: the third is admitted, a fourth is not.
    let two = &assets[..2];
    let plan = plan_founder_pass_wallet_turn(two, third, 3).unwrap();
    assert_eq!(plan.assets.len(), 3);
    assert_error(
        plan_founder_pass_wallet_turn(&plan.assets, Pubkey::new_unique(), 3),
        TycheError::FounderPassWalletPassLimitExceeded,
    );
}

#[test]
fn a_wallet_turn_record_wider_than_the_governed_limit_is_rejected() {
    // A record holding more assets than the current policy allows means the
    // stored state and the governed policy disagree. Failing closed is the
    // only safe reading; silently truncating would forget a spent pass.
    let assets: Vec<Pubkey> = (0..3).map(|_| Pubkey::new_unique()).collect();
    assert_error(
        plan_founder_pass_wallet_turn(&assets, Pubkey::new_unique(), 2),
        TycheError::InvalidFounderPassWalletTurn,
    );
}

// ---------- Governed policy bounds ----------

#[test]
fn the_concentration_policy_must_be_resolved_and_representable() {
    assert!(validate_founder_pass_concentration_policy(1, 1).is_ok());
    assert!(validate_founder_pass_concentration_policy(
        FOUNDER_PASS_VOTE_ALLOWANCE as u16,
        FOUNDER_PASS_WALLET_TURN_PASS_SLOTS as u8,
    )
    .is_ok());

    // Zero is the §14 unresolved sentinel on both dimensions.
    assert_error(
        validate_founder_pass_concentration_policy(0, 1),
        TycheError::InvalidFounderPassConcentrationLimit,
    );
    assert_error(
        validate_founder_pass_concentration_policy(1, 0),
        TycheError::InvalidFounderPassConcentrationLimit,
    );
    // A per-rule limit above the lifetime allowance constrains nothing.
    assert_error(
        validate_founder_pass_concentration_policy(FOUNDER_PASS_VOTE_ALLOWANCE as u16 + 1, 1),
        TycheError::InvalidFounderPassConcentrationLimit,
    );
    // A wallet limit the record layout cannot represent must be refused, not
    // truncated.
    assert_error(
        validate_founder_pass_concentration_policy(
            1,
            FOUNDER_PASS_WALLET_TURN_PASS_SLOTS as u8 + 1,
        ),
        TycheError::InvalidFounderPassConcentrationLimit,
    );
}

#[test]
fn the_fp2_accounts_are_bounded_and_wallet_keyed() {
    // Layout sizes are asserted so a future field addition is a deliberate
    // decision with a visible rent consequence, as FP1 did for its accounts.
    assert_eq!(FounderPassSponsorVault::INIT_SPACE, 2 + 8 + 8 + 1);
    assert_eq!(
        FounderPassWalletTurn::INIT_SPACE,
        2 + 32 + 8 + (4 + FOUNDER_PASS_WALLET_TURN_PASS_SLOTS * 32) + 1
    );
    assert_eq!(
        FounderPassVoteConcentration::INIT_SPACE,
        2 + 8 + 8 + 32 + 2 + 2 + 1
    );
}
