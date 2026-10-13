// ============================================================
// Program: Tyche
// Framework: Anchor
// Testing: Rust unit and integration tests
// Risk Level: Critical
// Security: See contracts/solana/security-checklist.md
// ============================================================

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};
#[cfg(feature = "idl-build")]
use anchor_lang::{Discriminator, IdlBuild};
use anchor_spl::token::{Mint, Token, TokenAccount};

pub mod domain;
pub mod founder_pass;

use founder_pass::{
    founder_pass_turn_window, founder_pass_unresolved_decisions, plan_founder_pass_fee_waiver,
    plan_founder_pass_use, plan_founder_pass_vote_concentration, plan_founder_pass_wallet_turn,
    validate_founder_pass_allowances, validate_founder_pass_concentration_policy,
    verify_founder_pass_asset, FounderPassAssetStandard, FounderPassBenefit,
    FounderPassFeeWaiverFunding, FounderPassOwnershipSnapshotPolicy, FounderPassPolicy,
    FounderPassSupplyEnforcement, FounderPassTurnWindow, FounderPassUsageView,
    FounderPassVoteConcentrationView, FounderPassVoteKind, FounderPassWaiverSettlement,
    FOUNDER_PASS_ACCOUNT_VERSION, FOUNDER_PASS_ACTIVE_TURN_WINDOW, FOUNDER_PASS_BET_ALLOWANCE,
    FOUNDER_PASS_MAX_SUPPLY, FOUNDER_PASS_RULE_PROPOSAL_ALLOWANCE, FOUNDER_PASS_VOTE_ALLOWANCE,
    FOUNDER_PASS_WALLET_TURN_PASS_SLOTS,
};

use domain::{
    derive_draw_numbers, next_cycle_index, run_rule_election, split_fee, validate_action_window,
    validate_config, validate_guess, validate_rule, ConfigValidation, ElectionCandidate,
    VOTE_FEE_START_TURN,
};
use orao_solana_vrf::state::{
    RandomnessAccountData as OraoRandomnessAccountData, RandomnessAccountVersion,
};
use solana_sha256_hasher::hash;
use switchboard_on_demand::RandomnessAccountData;

declare_id!("ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd");

pub const TURN_DURATION_CYCLE_LEN: usize = 4;
pub const MAX_FINALISTS: usize = 10;
pub const REPEATED_ACTION_FEE_MULTIPLIER: u64 = 2;
// The decision/elimination window is no longer a fixed sub-window: it spans the
// whole of phase 2 (the ~2h tail after the rule/guess cutoff), opening when the
// finalist set is locked and closing at the turn end. Its close time is stored
// on `TurnState.elimination_window_end_timestamp` (= the turn end), so there is
// no standalone window-duration constant. The active-rule election and draw run
// as an untimed settlement stage once the window closes.
// A recorded winner payout expires when EITHER bound is reached, whichever
// comes first (PRD §8.7.7). These mirror `CLAIM_WINDOW_TURNS` and
// `CLAIM_WINDOW_DAYS` in `packages/constants`; the programme is the authority
// for releasing the lamports, so it must not take the deadline on trust.
pub const CLAIM_WINDOW_TURNS: u64 = 12;
pub const CLAIM_WINDOW_SECONDS: i64 = 7 * 24 * 60 * 60;
pub const MAX_RULE_TEXT_BYTES: usize = 6000;
pub const BASIS_POINTS_DENOMINATOR: u16 = 10_000;
pub const ORAO_COMMIT_MARKER: u64 = u64::MAX;
pub const UPGRADEABLE_LOADER_ID: Pubkey = Pubkey::new_from_array([
    2, 168, 246, 145, 78, 136, 161, 176, 226, 16, 21, 62, 247, 99, 174, 43, 0, 194, 185, 61, 22,
    193, 36, 210, 192, 83, 122, 16, 4, 128, 0, 0,
]);

/// Raw 32-byte program id of the Switchboard On-Demand program that must own any
/// randomness account consumed by the trustless `settle_*` instructions.
///
/// Resolved at build time: `sb-devnet` builds (paired with `devnet-test` for the
/// devnet validation phase) bind the devnet Switchboard program; production
/// mainnet builds bind the mainnet program. This is the trust anchor that makes
/// `RandomnessAccountData::parse` meaningful — an account owned by any other
/// program is rejected before its bytes are ever interpreted, so a forged
/// look-alike account cannot inject a chosen randomness value.
///
/// Compared as raw bytes (not as `Pubkey`) because the Switchboard crate exposes
/// its own `Pubkey` type, which need not be identical to Anchor's.
#[cfg(feature = "sb-devnet")]
pub fn expected_switchboard_program() -> [u8; 32] {
    switchboard_on_demand::ON_DEMAND_DEVNET_PID.to_bytes()
}
#[cfg(not(feature = "sb-devnet"))]
pub fn expected_switchboard_program() -> [u8; 32] {
    switchboard_on_demand::ON_DEMAND_MAINNET_PID.to_bytes()
}

pub fn expected_orao_network_state() -> Pubkey {
    orao_solana_vrf::network_state_account_address(&orao_solana_vrf::ID)
}

fn require_program_upgrade_authority(
    program_data: &AccountInfo,
    governance_authority: Pubkey,
) -> Result<()> {
    let expected_program_data =
        Pubkey::find_program_address(&[crate::ID.as_ref()], &UPGRADEABLE_LOADER_ID).0;
    require_keys_eq!(
        program_data.key(),
        expected_program_data,
        TycheError::InvalidProgramData
    );

    let data = program_data.try_borrow_data()?;
    require!(data.len() >= 45, TycheError::InvalidProgramData);
    require!(
        u32::from_le_bytes(
            data[0..4]
                .try_into()
                .map_err(|_| error!(TycheError::InvalidProgramData))?
        ) == 3,
        TycheError::InvalidProgramData
    );
    require!(data[12] == 1, TycheError::InvalidGovernanceAuthority);
    let stored_authority = Pubkey::new_from_array(
        data[13..45]
            .try_into()
            .map_err(|_| error!(TycheError::InvalidProgramData))?,
    );
    require_keys_eq!(
        governance_authority,
        stored_authority,
        TycheError::InvalidGovernanceAuthority
    );
    Ok(())
}

fn require_direct_fee_routing(config: &GlobalConfig, treasury_vault: &TreasuryVault) -> Result<()> {
    require!(
        config.treasury_address != Pubkey::default()
            && config.treasury_address != treasury_vault.authority,
        TycheError::DirectFeeRoutingInactive
    );
    Ok(())
}

fn read_orao_randomness(randomness_ai: &AccountInfo) -> Result<OraoRandomnessAccountData> {
    require_keys_eq!(
        *randomness_ai.owner,
        orao_solana_vrf::ID,
        TycheError::InvalidRandomnessOwner
    );
    let data = randomness_ai.try_borrow_data()?;
    let mut data_ref: &[u8] = &data;
    OraoRandomnessAccountData::try_deserialize(&mut data_ref)
        .map_err(|_| error!(TycheError::InvalidRandomnessAccount))
}

fn validate_orao_request(
    randomness_ai: &AccountInfo,
    expected_authority: &Pubkey,
    require_fulfilled: bool,
) -> Result<Option<[u8; 32]>> {
    let randomness = read_orao_randomness(randomness_ai)?;
    require!(
        randomness.version() == RandomnessAccountVersion::V2,
        TycheError::UnsupportedRandomnessAccountVersion
    );
    require_keys_eq!(
        *randomness
            .client()
            .ok_or(TycheError::UnsupportedRandomnessAccountVersion)?,
        *expected_authority,
        TycheError::InvalidRandomnessClient
    );
    require!(
        *randomness.seed() != [0; 32],
        TycheError::InvalidRandomnessValue
    );
    require_keys_eq!(
        randomness_ai.key(),
        orao_solana_vrf::randomness_account_address(&orao_solana_vrf::ID, randomness.seed()),
        TycheError::RandomnessSourceMismatch
    );

    let fulfilled = randomness.fulfilled_randomness();
    if require_fulfilled {
        let digest = hash(fulfilled.ok_or(TycheError::RandomnessNotResolved)?).to_bytes();
        require!(digest != [0; 32], TycheError::InvalidRandomnessValue);
        Ok(Some(digest))
    } else {
        require!(fulfilled.is_none(), TycheError::RandomnessAlreadyResolved);
        Ok(None)
    }
}

/// Parse a committed Switchboard On-Demand randomness account and return its
/// configured queue + committed seed slot, after verifying the account is owned
/// by the Switchboard program and originates from the trusted VRF queue.
///
/// Used by the `request_*` (commit) instructions so the queue/owner are checked
/// once at commit time and the seed slot is recorded for the later settle.
fn read_committed_randomness(
    randomness_ai: &AccountInfo,
    expected_config: &Pubkey,
    expected_authority: &Pubkey,
) -> Result<u64> {
    if *expected_config == expected_orao_network_state() {
        validate_orao_request(randomness_ai, expected_authority, false)?;
        return Ok(ORAO_COMMIT_MARKER);
    }

    require!(
        randomness_ai.owner.to_bytes() == expected_switchboard_program(),
        TycheError::InvalidRandomnessOwner
    );
    let data = randomness_ai.try_borrow_data()?;
    let randomness = RandomnessAccountData::parse(data)
        .map_err(|_| error!(TycheError::InvalidRandomnessAccount))?;
    require!(
        randomness.queue.to_bytes() == expected_config.to_bytes(),
        TycheError::RandomnessQueueMismatch
    );
    Ok(randomness.seed_slot)
}

/// Read and trustlessly verify a revealed Switchboard On-Demand randomness
/// account, returning the 32-byte random value (PRD §5.6). No authority-supplied
/// randomness is accepted: the value is read directly from the Switchboard
/// account and bound to the account + commit slot recorded at request time.
///
/// Because `get_value` only succeeds when the current slot equals the account's
/// reveal slot, the Switchboard reveal and this settle must execute in the same
/// transaction — giving the caller exactly one shot per request and preventing
/// abort-and-retry bias.
fn verify_revealed_randomness(
    randomness_ai: &AccountInfo,
    expected_account: &Pubkey,
    expected_config: &Pubkey,
    expected_commit_slot: u64,
    expected_authority: &Pubkey,
    clock: &Clock,
) -> Result<[u8; 32]> {
    require_keys_eq!(
        randomness_ai.key(),
        *expected_account,
        TycheError::RandomnessSourceMismatch
    );
    if expected_commit_slot == ORAO_COMMIT_MARKER {
        return validate_orao_request(randomness_ai, expected_authority, true)?
            .ok_or_else(|| error!(TycheError::RandomnessNotResolved));
    }

    require!(
        randomness_ai.owner.to_bytes() == expected_switchboard_program(),
        TycheError::InvalidRandomnessOwner
    );
    let data = randomness_ai.try_borrow_data()?;
    let randomness = RandomnessAccountData::parse(data)
        .map_err(|_| error!(TycheError::InvalidRandomnessAccount))?;
    require!(
        randomness.queue.to_bytes() == expected_config.to_bytes(),
        TycheError::RandomnessQueueMismatch
    );
    require!(
        randomness.seed_slot == expected_commit_slot,
        TycheError::RandomnessCommitSlotMismatch
    );
    let value = randomness
        .get_value(clock.slot)
        .map_err(|_| error!(TycheError::RandomnessNotResolved))?;
    require!(value != [0; 32], TycheError::InvalidRandomnessValue);
    Ok(value)
}

#[cfg(test)]
mod randomness_provider_tests {
    use super::*;
    use orao_solana_vrf::state::{FulfilledRequest, PendingRequest, RandomnessV2, RequestAccount};

    fn serialize_orao(data: &RandomnessV2, size: usize) -> Vec<u8> {
        let mut bytes = vec![0; 8 + size];
        let mut output: &mut [u8] = &mut bytes;
        data.try_serialize(&mut output).unwrap();
        bytes
    }

    #[test]
    fn orao_pending_request_is_bound_to_client_seed_and_pda() {
        let authority = Pubkey::new_unique();
        let seed = [7; 32];
        let key = orao_solana_vrf::randomness_account_address(&orao_solana_vrf::ID, &seed);
        let owner = orao_solana_vrf::ID;
        let mut lamports = 1;
        let mut bytes = serialize_orao(
            &RandomnessV2 {
                request: RequestAccount::Pending(PendingRequest {
                    client: authority,
                    seed,
                    responses: vec![],
                }),
            },
            RandomnessV2::PENDING_SIZE,
        );
        let account = AccountInfo::new(
            &key,
            false,
            false,
            &mut lamports,
            &mut bytes,
            &owner,
            false,
            0,
        );

        assert_eq!(
            validate_orao_request(&account, &authority, false).unwrap(),
            None
        );
        assert!(validate_orao_request(&account, &Pubkey::new_unique(), false).is_err());
    }

    #[test]
    fn orao_fulfillment_is_hashed_and_cannot_be_pre_sampled() {
        let authority = Pubkey::new_unique();
        let seed = [8; 32];
        let raw_randomness = [9; 64];
        let key = orao_solana_vrf::randomness_account_address(&orao_solana_vrf::ID, &seed);
        let owner = orao_solana_vrf::ID;
        let mut lamports = 1;
        let mut bytes = serialize_orao(
            &RandomnessV2 {
                request: RequestAccount::Fulfilled(FulfilledRequest {
                    client: authority,
                    seed,
                    randomness: raw_randomness,
                }),
            },
            RandomnessV2::FULFILLED_SIZE,
        );
        let account = AccountInfo::new(
            &key,
            false,
            false,
            &mut lamports,
            &mut bytes,
            &owner,
            false,
            0,
        );

        assert!(validate_orao_request(&account, &authority, false).is_err());
        assert_eq!(
            validate_orao_request(&account, &authority, true)
                .unwrap()
                .unwrap(),
            hash(&raw_randomness).to_bytes()
        );
    }
}

#[program]
pub mod tyche {
    use super::*;

    pub fn initialize_global_config(
        ctx: Context<InitializeGlobalConfig>,
        args: InitializeGlobalConfigArgs,
    ) -> Result<()> {
        validate_config(&ConfigValidation {
            treasury_fee_bps: args.treasury_fee_bps,
            turn_duration_cycle: &args.turn_duration_cycle,
            rule_election_cutoff_bps: args.rule_election_cutoff_bps,
            guess_cutoff_bps: args.guess_cutoff_bps,
            max_rule_tokens: args.max_rule_tokens,
            top_voted_finalist_count: args.top_voted_finalist_count,
            random_finalist_count: args.random_finalist_count,
        })?;
        require!(
            args.treasury_address != Pubkey::default()
                && args.draw_vrf_config != Pubkey::default()
                && args.election_vrf_config != Pubkey::default(),
            TycheError::InvalidConfigAddress
        );

        let config = &mut ctx.accounts.global_config;
        config.authority = ctx.accounts.authority.key();
        config.pending_authority = None;
        config.treasury_address = args.treasury_address;
        config.draw_vrf_config = args.draw_vrf_config;
        config.election_vrf_config = args.election_vrf_config;
        config.guess_submission_fee_lamports = args.guess_submission_fee_lamports;
        config.rule_proposal_fee_lamports = args.rule_proposal_fee_lamports;
        config.rule_removal_fee_lamports = args.rule_removal_fee_lamports;
        config.vote_fee_lamports = args.vote_fee_lamports;
        config.treasury_fee_bps = args.treasury_fee_bps;
        config.turn_duration_cycle = args.turn_duration_cycle;
        config.active_turn_duration_index = 0;
        config.rule_election_cutoff_bps = args.rule_election_cutoff_bps;
        config.guess_cutoff_bps = args.guess_cutoff_bps;
        config.max_rule_tokens = args.max_rule_tokens;
        config.top_voted_finalist_count = args.top_voted_finalist_count;
        config.random_finalist_count = args.random_finalist_count;
        config.max_rule_proposals_per_wallet_per_turn = args.max_rule_proposals_per_wallet_per_turn;
        config.max_votes_per_wallet_per_turn = args.max_votes_per_wallet_per_turn;
        config.minimum_claim_threshold_lamports = args.minimum_claim_threshold_lamports;
        config.claim_window_turns = args.claim_window_turns;
        config.claim_window_days = args.claim_window_days;
        config.creator_reward_cap_lamports = args.creator_reward_cap_lamports;
        config.min_votes_creator_self_remove = args.min_votes_creator_self_remove;
        config.min_votes_third_party_remove = args.min_votes_third_party_remove;
        config.next_turn_id = 1;
        config.active_turn_id = 0;
        config.has_active_turn = false;
        config.paused = false;
        config.bump = ctx.bumps.global_config;

        let treasury_vault = &mut ctx.accounts.treasury_vault;
        // A zero legacy authority marks new deployments as direct-routing
        // native. Existing deployments retain the old custody address here
        // until `migrate_fee_pool_custody` atomically sweeps and activates.
        treasury_vault.authority = Pubkey::default();
        treasury_vault.total_collected_lamports = 0;
        treasury_vault.bump = ctx.bumps.treasury_vault;

        emit!(GlobalConfigInitialized {
            authority: config.authority,
            treasury_address: config.treasury_address,
        });
        Ok(())
    }

    pub fn set_vrf_config(ctx: Context<SetVrfConfig>, args: SetVrfConfigArgs) -> Result<()> {
        require!(
            args.draw_vrf_config != Pubkey::default()
                && args.election_vrf_config != Pubkey::default(),
            TycheError::InvalidConfigAddress
        );
        require_program_upgrade_authority(
            &ctx.accounts.program_data,
            ctx.accounts.governance_authority.key(),
        )?;

        let config = &mut ctx.accounts.global_config;
        require!(!config.has_active_turn, TycheError::ActiveTurnExists);
        let old_draw_vrf_config = config.draw_vrf_config;
        let old_election_vrf_config = config.election_vrf_config;
        config.draw_vrf_config = args.draw_vrf_config;
        config.election_vrf_config = args.election_vrf_config;

        emit!(VrfConfigUpdated {
            authority: ctx.accounts.governance_authority.key(),
            old_draw_vrf_config,
            new_draw_vrf_config: config.draw_vrf_config,
            old_election_vrf_config,
            new_election_vrf_config: config.election_vrf_config,
        });
        Ok(())
    }

    /// Atomically consolidates every accounted lamport from the legacy Tyche
    /// vault into Tokenomics Core's canonical distribution pool. The portion
    /// attributable to closed, unbridged turns remains in the Tyche counter as
    /// outstanding accounting; the older unattributed portion becomes epoch-0
    /// rollover through a game-authority-signed CPI.
    pub fn migrate_fee_pool_custody(
        ctx: Context<MigrateFeePoolCustody>,
        args: MigrateFeePoolCustodyArgs,
    ) -> Result<()> {
        require_program_upgrade_authority(
            &ctx.accounts.program_data,
            ctx.accounts.governance_authority.key(),
        )?;
        require_keys_eq!(
            ctx.accounts.token_config.game_authority,
            ctx.accounts.global_config.key(),
            TycheError::InvalidTokenomicsConfiguration
        );
        require_keys_eq!(
            ctx.accounts.global_config.treasury_address,
            ctx.accounts.treasury_vault.authority,
            TycheError::FeePoolMigrationAlreadyApplied
        );
        require_keys_neq!(
            ctx.accounts.distribution_vault.key(),
            ctx.accounts.treasury_vault.key(),
            TycheError::InvalidFeePool
        );
        require!(
            args.attributed_unbridged_lamports > 0 && args.legacy_rollover_lamports > 0,
            TycheError::InvalidFeePoolMigrationAmounts
        );

        let migration_total = args
            .attributed_unbridged_lamports
            .checked_add(args.legacy_rollover_lamports)
            .ok_or(TycheError::ArithmeticOverflow)?;
        require_eq!(
            migration_total,
            ctx.accounts.treasury_vault.total_collected_lamports,
            TycheError::InvalidFeePoolMigrationAmounts
        );
        require_eq!(
            available_lamports(&ctx.accounts.treasury_vault.to_account_info())?,
            migration_total,
            TycheError::InvalidFeePoolMigrationAmounts
        );

        pay_from_vault(
            &ctx.accounts.treasury_vault.to_account_info(),
            &ctx.accounts.distribution_vault.to_account_info(),
            migration_total,
        )?;

        let bump = ctx.accounts.global_config.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"global_config", &[bump]]];
        tokenomics_core::cpi::record_legacy_fee_rollover(
            CpiContext::new_with_signer(
                ctx.accounts.tokenomics_program.to_account_info(),
                tokenomics_core::cpi::accounts::RecordLegacyFeeRollover {
                    game_authority: ctx.accounts.global_config.to_account_info(),
                    token_config: ctx.accounts.token_config.to_account_info(),
                    distribution_vault: ctx.accounts.distribution_vault.to_account_info(),
                },
                signer_seeds,
            )
            // The caller has already debited the Tyche-owned vault and credited
            // the distribution vault. Include both sides in the CPI account set
            // so the runtime can reconcile the child invocation's lamport sum.
            .with_remaining_accounts(vec![ctx.accounts.treasury_vault.to_account_info()]),
            args.legacy_rollover_lamports,
        )?;

        let old_custody = ctx.accounts.global_config.treasury_address;
        ctx.accounts.global_config.treasury_address = ctx.accounts.distribution_vault.key();
        ctx.accounts.treasury_vault.total_collected_lamports = args.attributed_unbridged_lamports;
        emit!(FeePoolCustodyMigrated {
            governance_authority: ctx.accounts.governance_authority.key(),
            old_custody,
            fee_pool: ctx.accounts.distribution_vault.key(),
            transferred_lamports: migration_total,
            attributed_unbridged_lamports: args.attributed_unbridged_lamports,
            legacy_rollover_lamports: args.legacy_rollover_lamports,
        });
        Ok(())
    }

    pub fn open_turn(ctx: Context<OpenTurn>, turn_id: u64) -> Result<()> {
        let config = &mut ctx.accounts.global_config;
        require!(!config.paused, TycheError::ProtocolPaused);
        require!(!config.has_active_turn, TycheError::ActiveTurnExists);
        require_eq!(turn_id, config.next_turn_id, TycheError::InvalidTurnId);

        let cycle_index = config.active_turn_duration_index;
        let turn_duration_seconds = *config
            .turn_duration_cycle
            .get(usize::from(cycle_index))
            .ok_or(TycheError::InvalidCycleIndex)?;
        let clock = Clock::get()?;
        let end_timestamp = clock
            .unix_timestamp
            .checked_add(i64::from(turn_duration_seconds))
            .ok_or(TycheError::ArithmeticOverflow)?;

        let turn = &mut ctx.accounts.turn_state;
        turn.turn_id = turn_id;
        turn.start_timestamp = clock.unix_timestamp;
        turn.end_timestamp = end_timestamp;
        turn.status = TurnStatus::Open;
        turn.prize_pool_amount_lamports = 0;
        turn.treasury_fee_amount_lamports = 0;
        turn.treasury_fee_bridged = false;
        turn.turn_duration_seconds = turn_duration_seconds;
        turn.cycle_index = cycle_index;
        turn.draw_result = [0; 6];
        turn.active_rule_id = 0;
        turn.active_rule_hash = [0; 32];
        turn.frozen_rule_artifact_hash = [0; 32];
        turn.eligible_rule_pool_hash = [0; 32];
        turn.top_voted_finalist_hash = [0; 32];
        turn.random_finalist_hash = [0; 32];
        turn.finalist_set_hash = [0; 32];
        turn.finalist_count = 0;
        turn.finalist_rule_ids = [0; MAX_FINALISTS];
        turn.finalist_approval_vote_counts = [0; MAX_FINALISTS];
        turn.finalist_elimination_vote_counts = [0; MAX_FINALISTS];
        turn.finalist_eliminated = [false; MAX_FINALISTS];
        turn.eliminated_finalist_hash = [0; 32];
        turn.survivor_finalist_hash = [0; 32];
        turn.elimination_window_end_timestamp = 0;
        turn.election_vrf_request = Pubkey::default();
        turn.election_vrf_fulfillment = Pubkey::default();
        turn.election_commit_slot = 0;
        turn.elected_finalist_index = 0;
        turn.active_election_vrf_request = Pubkey::default();
        turn.active_election_vrf_fulfillment = Pubkey::default();
        turn.active_election_commit_slot = 0;
        turn.elected_survivor_index = 0;
        turn.draw_status = DrawStatus::NotRequested;
        turn.draw_vrf_request = Pubkey::default();
        turn.draw_vrf_fulfillment = Pubkey::default();
        turn.draw_commit_slot = 0;
        turn.draw_randomness = [0; 32];
        turn.draw_requested_at = 0;
        turn.drawn_at = 0;
        turn.draw_failure_code = 0;
        turn.original_pool_rollover_lamports = 0;
        turn.alternative_pool_rollover_lamports = 0;
        turn.bump = ctx.bumps.turn_state;

        let prize_vault = &mut ctx.accounts.prize_vault;
        prize_vault.turn_id = turn_id;
        prize_vault.total_collected_lamports = 0;
        prize_vault.bump = ctx.bumps.prize_vault;

        config.active_turn_id = turn_id;
        config.has_active_turn = true;

        emit!(TurnOpened {
            turn_id,
            start_timestamp: turn.start_timestamp,
            end_timestamp,
            cycle_index,
        });
        Ok(())
    }

    pub fn set_turn_duration_cycle(
        ctx: Context<SetTurnDurationCycle>,
        args: SetTurnDurationCycleArgs,
    ) -> Result<()> {
        let config = &mut ctx.accounts.global_config;
        require!(!config.paused, TycheError::ProtocolPaused);
        require!(config.has_active_turn, TycheError::NoActiveTurn);
        require_eq!(
            config.active_turn_id,
            ctx.accounts.turn_state.turn_id,
            TycheError::InvalidTurnId
        );
        require!(
            ctx.accounts.turn_state.status == TurnStatus::Open,
            TycheError::TurnNotOpen
        );

        validate_config(&ConfigValidation {
            treasury_fee_bps: config.treasury_fee_bps,
            turn_duration_cycle: &args.turn_duration_cycle,
            rule_election_cutoff_bps: config.rule_election_cutoff_bps,
            guess_cutoff_bps: config.guess_cutoff_bps,
            max_rule_tokens: config.max_rule_tokens,
            top_voted_finalist_count: config.top_voted_finalist_count,
            random_finalist_count: config.random_finalist_count,
        })?;

        let turn = &mut ctx.accounts.turn_state;
        let old_duration_seconds = turn.turn_duration_seconds;
        let old_end_timestamp = turn.end_timestamp;
        let new_duration_seconds = *args
            .turn_duration_cycle
            .get(usize::from(turn.cycle_index))
            .ok_or(TycheError::InvalidCycleIndex)?;
        let new_end_timestamp = turn
            .start_timestamp
            .checked_add(i64::from(new_duration_seconds))
            .ok_or(TycheError::ArithmeticOverflow)?;

        config.turn_duration_cycle = args.turn_duration_cycle;
        turn.turn_duration_seconds = new_duration_seconds;
        turn.end_timestamp = new_end_timestamp;

        emit!(TurnDurationCycleUpdated {
            turn_id: turn.turn_id,
            old_duration_seconds,
            new_duration_seconds,
            old_end_timestamp,
            new_end_timestamp,
        });
        Ok(())
    }

    pub fn submit_guess(ctx: Context<SubmitGuess>, args: SubmitGuessArgs) -> Result<()> {
        require!(args.sequence == 1, TycheError::InvalidActionSequence);
        submit_guess_with_game_token_init(ctx, args)
    }

    pub fn submit_additional_guess(
        ctx: Context<SubmitAdditionalGuess>,
        args: SubmitGuessArgs,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        validate_turn_action_window(
            clock.unix_timestamp,
            &ctx.accounts.turn_state,
            config.guess_cutoff_bps,
        )?;
        validate_guess(&args.numbers)?;
        validate_game_token(
            &ctx.accounts.game_token,
            ctx.accounts.turn_state.turn_id,
            ctx.accounts.player.key(),
        )?;
        let expected_sequence = ctx
            .accounts
            .game_token
            .guess_count
            .checked_add(1)
            .ok_or(TycheError::ArithmeticOverflow)?;
        require!(
            args.sequence == expected_sequence,
            TycheError::InvalidActionSequence
        );
        let fee_lamports = repeated_action_fee_lamports(
            config.guess_submission_fee_lamports,
            ctx.accounts.turn_state.turn_id,
            args.sequence,
        )?;

        collect_fee(
            &ctx.accounts.player,
            config,
            &ctx.accounts.treasury_vault,
            &ctx.accounts.fee_pool,
            &ctx.accounts.prize_vault,
            &ctx.accounts.system_program,
            fee_lamports,
        )?;
        let fee = ActionFeeOutcome::paid(fee_lamports, config.treasury_fee_bps)?;
        let player = ctx.accounts.player.key();

        apply_additional_guess(
            &mut ctx.accounts.turn_state,
            &mut ctx.accounts.treasury_vault,
            &mut ctx.accounts.prize_vault,
            &mut ctx.accounts.player_guess,
            &mut ctx.accounts.game_token,
            player,
            &args,
            fee,
            clock.unix_timestamp,
            ctx.bumps.player_guess,
        )
    }

    pub fn propose_rule(ctx: Context<ProposeRule>, args: ProposeRuleArgs) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        validate_turn_action_window(
            clock.unix_timestamp,
            &ctx.accounts.turn_state,
            config.rule_election_cutoff_bps,
        )?;
        validate_game_token(
            &ctx.accounts.game_token,
            ctx.accounts.turn_state.turn_id,
            ctx.accounts.proposer.key(),
        )?;
        validate_rule(
            &args.sanitized_text,
            &args.sanitized_text_hash,
            &args.preflight_result_hash,
            args.token_count,
            config.max_rule_tokens,
        )?;
        let proposal_sequence = ctx
            .accounts
            .game_token
            .used_for_rule_proposal_count
            .checked_add(1)
            .ok_or(TycheError::ArithmeticOverflow)?;
        let proposal_fee = repeated_action_fee_lamports(
            config.rule_proposal_fee_lamports,
            ctx.accounts.turn_state.turn_id,
            proposal_sequence,
        )?;

        collect_fee(
            &ctx.accounts.proposer,
            config,
            &ctx.accounts.treasury_vault,
            &ctx.accounts.fee_pool,
            &ctx.accounts.prize_vault,
            &ctx.accounts.system_program,
            proposal_fee,
        )?;
        let fee = ActionFeeOutcome::paid(proposal_fee, config.treasury_fee_bps)?;
        let proposer = ctx.accounts.proposer.key();
        let bump = ctx.bumps.rule_proposal;

        apply_rule_proposal(
            &mut ctx.accounts.turn_state,
            &mut ctx.accounts.treasury_vault,
            &mut ctx.accounts.prize_vault,
            &mut ctx.accounts.rule_proposal,
            &mut ctx.accounts.game_token,
            proposer,
            args,
            fee,
            clock.unix_timestamp,
            bump,
        )
    }

    pub fn vote_rule(ctx: Context<VoteRule>, args: VoteRuleArgs) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        let finalist_index = validate_approval_vote_window(
            clock.unix_timestamp,
            config,
            &ctx.accounts.turn_state,
            ctx.accounts.rule_proposal.rule_id,
        )?;
        validate_game_token(
            &ctx.accounts.game_token,
            ctx.accounts.turn_state.turn_id,
            ctx.accounts.voter.key(),
        )?;
        require!(
            matches!(
                ctx.accounts.rule_proposal.state,
                RuleState::Proposed | RuleState::Eligible
            ),
            TycheError::RuleNotVoteable
        );
        require!(args.sequence > 0, TycheError::InvalidActionSequence);

        let vote_fee = repeated_action_fee_lamports(
            config.vote_fee_lamports,
            ctx.accounts.turn_state.turn_id,
            args.sequence,
        )?;
        collect_fee(
            &ctx.accounts.voter,
            config,
            &ctx.accounts.treasury_vault,
            &ctx.accounts.fee_pool,
            &ctx.accounts.prize_vault,
            &ctx.accounts.system_program,
            vote_fee,
        )?;
        let fee = ActionFeeOutcome::paid(vote_fee, config.treasury_fee_bps)?;
        let voter = ctx.accounts.voter.key();
        let bump = ctx.bumps.rule_vote;

        apply_rule_vote(
            &mut ctx.accounts.turn_state,
            &mut ctx.accounts.treasury_vault,
            &mut ctx.accounts.prize_vault,
            &mut ctx.accounts.rule_proposal,
            &mut ctx.accounts.rule_vote,
            &mut ctx.accounts.game_token,
            voter,
            args.sequence,
            finalist_index,
            fee,
            clock.unix_timestamp,
            bump,
        )
    }

    pub fn remove_rule(ctx: Context<RemoveRule>) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        // Paid removal is only allowed while the turn is open and BEFORE the
        // eligible rule pool is locked (PRD §6.11). Once the pool is locked the
        // rule may already be a finalist, so paid player removal is closed.
        require!(
            ctx.accounts.turn_state.eligible_rule_pool_hash == [0; 32],
            TycheError::RuleRemovalWindowClosed
        );
        validate_game_token(
            &ctx.accounts.game_token,
            ctx.accounts.turn_state.turn_id,
            ctx.accounts.remover.key(),
        )?;
        // Only still-live proposals can be removed by paid action. Finalist,
        // elected, frozen, eliminated, survived, invalidated, expired, and
        // already-removed rules are protected.
        require!(
            matches!(
                ctx.accounts.rule_proposal.state,
                RuleState::Proposed | RuleState::Eligible
            ),
            TycheError::RuleNotRemovable
        );

        let is_creator = ctx.accounts.rule_proposal.proposer == ctx.accounts.remover.key();
        require!(is_creator, TycheError::RuleRemovalNotCreator);

        // Creator self-removal is blocked once the rule has community momentum.
        let threshold = config.min_votes_creator_self_remove;
        require!(
            ctx.accounts.rule_proposal.vote_count < threshold,
            TycheError::RuleRemovalProtected
        );

        // The removal fee is routed to the current turn prize pool, retaining the
        // standard protocol treasury fee like every other prize-pool source
        // (PRD §2.5 / §6.11 "follows normal treasury/prize-pool accounting").
        let fee = config.rule_removal_fee_lamports;
        collect_fee(
            &ctx.accounts.remover,
            config,
            &ctx.accounts.treasury_vault,
            &ctx.accounts.fee_pool,
            &ctx.accounts.prize_vault,
            &ctx.accounts.system_program,
            fee,
        )?;
        let (treasury_amount, prize_amount) = split_fee(fee, config.treasury_fee_bps)?;

        let removal_kind = RuleRemovalKind::CreatorSelf;
        let vote_count_at_removal = ctx.accounts.rule_proposal.vote_count;

        let removal = &mut ctx.accounts.rule_removal;
        removal.turn_id = ctx.accounts.turn_state.turn_id;
        removal.rule_id = ctx.accounts.rule_proposal.rule_id;
        removal.remover = ctx.accounts.remover.key();
        removal.removal_kind = removal_kind;
        removal.fee_lamports = fee;
        removal.vote_count_at_removal = vote_count_at_removal;
        removal.removed_at = clock.unix_timestamp;
        removal.bump = ctx.bumps.rule_removal;

        // Status change only — historical data is preserved (PRD §6.11).
        ctx.accounts.rule_proposal.state = RuleState::RemovedPaid;

        ctx.accounts.turn_state.treasury_fee_amount_lamports = ctx
            .accounts
            .turn_state
            .treasury_fee_amount_lamports
            .checked_add(treasury_amount)
            .ok_or(TycheError::ArithmeticOverflow)?;
        ctx.accounts.treasury_vault.total_collected_lamports = ctx
            .accounts
            .treasury_vault
            .total_collected_lamports
            .checked_add(treasury_amount)
            .ok_or(TycheError::ArithmeticOverflow)?;
        ctx.accounts.prize_vault.total_collected_lamports = ctx
            .accounts
            .prize_vault
            .total_collected_lamports
            .checked_add(prize_amount)
            .ok_or(TycheError::ArithmeticOverflow)?;
        ctx.accounts.turn_state.prize_pool_amount_lamports = ctx
            .accounts
            .turn_state
            .prize_pool_amount_lamports
            .checked_add(prize_amount)
            .ok_or(TycheError::ArithmeticOverflow)?;

        emit!(RuleRemoved {
            turn_id: removal.turn_id,
            rule_id: removal.rule_id,
            remover: removal.remover,
            removal_kind,
            fee_lamports: fee,
            vote_count_at_removal,
        });
        Ok(())
    }

    pub fn precompile_rule(ctx: Context<PrecompileRule>, args: PrecompileRuleArgs) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        validate_turn_action_window(
            clock.unix_timestamp,
            &ctx.accounts.turn_state,
            config.rule_election_cutoff_bps,
        )?;

        let proposal = &mut ctx.accounts.rule_proposal;
        if args.passed {
            require!(
                args.compiled_artifact_hash != [0; 32],
                TycheError::InvalidCompiledArtifact
            );
            proposal.compiled_artifact_hash = args.compiled_artifact_hash;
            proposal.precompilation_status = PrecompilationStatus::Passed;
            proposal.state = RuleState::Eligible;
        } else {
            proposal.compiled_artifact_hash = [0; 32];
            proposal.precompilation_status = PrecompilationStatus::Failed;
            proposal.state = RuleState::Invalidated;
        }

        emit!(RulePrecompiled {
            turn_id: proposal.turn_id,
            rule_id: proposal.rule_id,
            passed: args.passed,
            compiled_artifact_hash: proposal.compiled_artifact_hash,
        });
        Ok(())
    }

    pub fn lock_rule_election_pool(ctx: Context<LockRuleElectionPool>) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, TycheError::ProtocolPaused);
        require_election_cutoff_reached(config, &ctx.accounts.turn_state)?;

        let candidates =
            read_election_candidates(ctx.remaining_accounts, ctx.accounts.turn_state.turn_id)?;
        let result = run_rule_election(
            &candidates,
            &[1; 32],
            ctx.accounts.turn_state.turn_id,
            config.top_voted_finalist_count,
            config.random_finalist_count,
        )?;
        ctx.accounts.turn_state.eligible_rule_pool_hash = result.eligible_rule_pool_hash;

        emit!(RuleElectionPoolLocked {
            turn_id: ctx.accounts.turn_state.turn_id,
            eligible_rule_count: result.eligible_rule_ids.len() as u16,
            eligible_rule_pool_hash: result.eligible_rule_pool_hash,
        });
        Ok(())
    }

    /// Finalist-election VRF commit step. Verifies the supplied Switchboard
    /// account (owner + configured election queue) and records its address and
    /// committed `seed_slot` for the later `settle_rule_election` verification.
    /// This starts only after phase 1 ends and the eligible pool is locked; the
    /// phase-2 clock starts when the shortlist is actually settled.
    pub fn request_rule_election_vrf(ctx: Context<RequestRuleElectionVrf>) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, TycheError::ProtocolPaused);
        require_election_cutoff_reached(config, &ctx.accounts.turn_state)?;
        require!(
            ctx.accounts.turn_state.eligible_rule_pool_hash != [0; 32],
            TycheError::ElectionPoolNotLocked
        );
        require!(
            ctx.accounts.turn_state.election_vrf_request == Pubkey::default(),
            TycheError::ElectionVrfAlreadyRequested
        );

        let randomness_account = ctx.accounts.randomness.key();
        let commit_slot = read_committed_randomness(
            &ctx.accounts.randomness,
            &config.election_vrf_config,
            &ctx.accounts.authority.key(),
        )?;
        ctx.accounts.turn_state.election_vrf_request = randomness_account;
        ctx.accounts.turn_state.election_commit_slot = commit_slot;

        emit!(RuleElectionVrfRequested {
            turn_id: ctx.accounts.turn_state.turn_id,
            randomness_account,
        });
        Ok(())
    }

    /// Settle the finalist election by reading and verifying the revealed
    /// Switchboard randomness on-chain (trustless), then deriving the finalist
    /// set deterministically from that verified value.
    pub fn settle_rule_election(ctx: Context<SettleRuleElection>) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, TycheError::ProtocolPaused);
        require_election_cutoff_reached(config, &ctx.accounts.turn_state)?;
        require!(
            ctx.accounts.turn_state.election_vrf_request != Pubkey::default(),
            TycheError::ElectionVrfNotRequested
        );

        let clock = Clock::get()?;
        let randomness_source = ctx.accounts.randomness.key();
        let randomness = verify_revealed_randomness(
            &ctx.accounts.randomness,
            &ctx.accounts.turn_state.election_vrf_request,
            &config.election_vrf_config,
            ctx.accounts.turn_state.election_commit_slot,
            &ctx.accounts.authority.key(),
            &clock,
        )?;

        let candidates =
            read_election_candidates(ctx.remaining_accounts, ctx.accounts.turn_state.turn_id)?;
        let result = run_rule_election(
            &candidates,
            &randomness,
            ctx.accounts.turn_state.turn_id,
            config.top_voted_finalist_count,
            config.random_finalist_count,
        )?;
        require!(
            result.eligible_rule_pool_hash == ctx.accounts.turn_state.eligible_rule_pool_hash,
            TycheError::ElectionPoolHashMismatch
        );

        let turn = &mut ctx.accounts.turn_state;
        turn.top_voted_finalist_hash = result.top_voted_finalist_hash;
        turn.random_finalist_hash = result.random_finalist_hash;
        turn.finalist_set_hash = result.finalist_set_hash;
        turn.finalist_count = result.finalist_rule_ids.len() as u8;
        turn.finalist_rule_ids = [0; MAX_FINALISTS];
        turn.finalist_approval_vote_counts = [0; MAX_FINALISTS];
        turn.finalist_elimination_vote_counts = [0; MAX_FINALISTS];
        turn.finalist_eliminated = [false; MAX_FINALISTS];
        for (index, rule_id) in result.finalist_rule_ids.iter().enumerate() {
            require!(index < MAX_FINALISTS, TycheError::InvalidFinalistCounts);
            let candidate = candidates
                .iter()
                .find(|candidate| candidate.rule_id == *rule_id)
                .ok_or(TycheError::InvalidTurnId)?;
            turn.finalist_rule_ids[index] = *rule_id;
            turn.finalist_approval_vote_counts[index] = candidate.vote_count;
        }
        let phase2_duration_seconds = phase_two_duration_seconds(config, turn)?;
        let shifted_end_timestamp = clock
            .unix_timestamp
            .checked_add(phase2_duration_seconds)
            .ok_or(TycheError::ArithmeticOverflow)?;
        if shifted_end_timestamp > turn.end_timestamp {
            turn.end_timestamp = shifted_end_timestamp;
        }
        // The elimination/decision window spans the whole of phase 2: voting is
        // open from now (finalist set locked) until the turn end, and the
        // active-rule election + draw run as an untimed settlement stage after
        // it closes (mirroring the shortlist draw between phase 1 and phase 2).
        turn.elimination_window_end_timestamp = turn.end_timestamp;
        turn.election_vrf_fulfillment = randomness_source;
        turn.elected_finalist_index = 0;
        turn.active_rule_id = 0;
        turn.active_rule_hash = [0; 32];
        turn.frozen_rule_artifact_hash = [0; 32];

        emit!(RuleElectionSettled {
            turn_id: turn.turn_id,
            active_rule_id: turn.active_rule_id,
            elected_finalist_index: turn.elected_finalist_index,
            top_voted_finalist_hash: turn.top_voted_finalist_hash,
            random_finalist_hash: turn.random_finalist_hash,
            finalist_set_hash: turn.finalist_set_hash,
            randomness_source,
        });
        Ok(())
    }

    pub fn eliminate_vote_rule(
        ctx: Context<EliminateVoteRule>,
        args: EliminateVoteRuleArgs,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        validate_game_token(
            &ctx.accounts.game_token,
            ctx.accounts.turn_state.turn_id,
            ctx.accounts.voter.key(),
        )?;
        // The window opens when the finalist set is locked (finalist_count > 0,
        // which also stamps elimination_window_end_timestamp = turn end) and
        // stays open for the whole of phase 2, i.e. until the turn end.
        require!(
            ctx.accounts.turn_state.finalist_count > 0
                && ctx.accounts.turn_state.elimination_window_end_timestamp > 0,
            TycheError::EliminationWindowNotOpen
        );
        require!(
            clock.unix_timestamp < ctx.accounts.turn_state.elimination_window_end_timestamp,
            TycheError::EliminationWindowNotOpen
        );
        let index = finalist_index(&ctx.accounts.turn_state, ctx.accounts.rule_proposal.rule_id)
            .ok_or(TycheError::RuleNotFinalist)?;
        require!(
            !ctx.accounts.turn_state.finalist_eliminated[index],
            TycheError::RuleAlreadyEliminated
        );
        require!(args.sequence > 0, TycheError::InvalidActionSequence);

        let fee = repeated_action_fee_lamports(
            config.vote_fee_lamports,
            ctx.accounts.turn_state.turn_id,
            args.sequence,
        )?;
        collect_fee(
            &ctx.accounts.voter,
            config,
            &ctx.accounts.treasury_vault,
            &ctx.accounts.fee_pool,
            &ctx.accounts.prize_vault,
            &ctx.accounts.system_program,
            fee,
        )?;
        let fee_outcome = ActionFeeOutcome::paid(fee, config.treasury_fee_bps)?;
        let voter = ctx.accounts.voter.key();
        let rule_id = ctx.accounts.rule_proposal.rule_id;
        let bump = ctx.bumps.rule_elimination_vote;

        apply_rule_elimination_vote(
            &mut ctx.accounts.turn_state,
            &mut ctx.accounts.treasury_vault,
            &mut ctx.accounts.prize_vault,
            &mut ctx.accounts.rule_elimination_vote,
            rule_id,
            voter,
            args.sequence,
            index,
            fee_outcome,
            clock.unix_timestamp,
            bump,
        )
    }

    pub fn close_elimination_window(ctx: Context<CloseEliminationWindow>) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        require!(
            ctx.accounts.turn_state.finalist_count > 0
                && ctx.accounts.turn_state.elimination_window_end_timestamp > 0,
            TycheError::EliminationWindowNotOpen
        );
        require!(
            clock.unix_timestamp >= ctx.accounts.turn_state.elimination_window_end_timestamp,
            TycheError::EliminationWindowNotClosed
        );

        let turn = &mut ctx.accounts.turn_state;
        let finalist_count = usize::from(turn.finalist_count);
        let mut qualified: Vec<usize> = (0..finalist_count)
            .filter(|index| {
                turn.finalist_elimination_vote_counts[*index]
                    > turn.finalist_approval_vote_counts[*index]
            })
            .collect();
        qualified.sort_by(|left, right| {
            turn.finalist_elimination_vote_counts[*right]
                .cmp(&turn.finalist_elimination_vote_counts[*left])
                .then_with(|| {
                    turn.finalist_approval_vote_counts[*left]
                        .cmp(&turn.finalist_approval_vote_counts[*right])
                })
                .then_with(|| turn.finalist_rule_ids[*left].cmp(&turn.finalist_rule_ids[*right]))
        });
        let max_eliminations = 5usize.min(finalist_count.saturating_sub(1));
        for index in qualified.into_iter().take(max_eliminations) {
            turn.finalist_eliminated[index] = true;
        }

        let survivors: Vec<u64> = (0..finalist_count)
            .filter(|index| !turn.finalist_eliminated[*index])
            .map(|index| turn.finalist_rule_ids[index])
            .collect();
        require!(!survivors.is_empty(), TycheError::NoSurvivingFinalist);
        turn.eliminated_finalist_hash = hash_elimination_state(turn);
        turn.survivor_finalist_hash = hash_rule_ids(b"survivor_finalists_v1", &survivors);

        for account_info in ctx.remaining_accounts {
            if *account_info.owner != ID || !account_info.is_writable {
                continue;
            }
            let mut data = account_info.try_borrow_mut_data()?;
            let mut data_ref: &[u8] = &data;
            let mut proposal = RuleProposal::try_deserialize(&mut data_ref)?;
            if let Some(index) = finalist_index(turn, proposal.rule_id) {
                proposal.state = if turn.finalist_eliminated[index] {
                    RuleState::Eliminated
                } else {
                    RuleState::SurvivedElimination
                };
                let mut output: &mut [u8] = &mut data;
                proposal.try_serialize(&mut output)?;
            }
        }

        emit!(EliminationWindowClosed {
            turn_id: turn.turn_id,
            eliminated_finalist_hash: turn.eliminated_finalist_hash,
            survivor_finalist_hash: turn.survivor_finalist_hash,
        });
        Ok(())
    }

    /// Active-election VRF commit step over the surviving finalists. Verifies the
    /// supplied Switchboard account (owner + configured election queue) and
    /// records its address and committed `seed_slot` for `settle_active_election`.
    pub fn request_active_election_vrf(ctx: Context<RequestActiveElectionVrf>) -> Result<()> {
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        require!(
            ctx.accounts.turn_state.survivor_finalist_hash != [0; 32],
            TycheError::EliminationWindowNotClosed
        );
        require!(
            ctx.accounts.turn_state.active_election_vrf_request == Pubkey::default(),
            TycheError::ElectionVrfAlreadyRequested
        );

        let randomness_account = ctx.accounts.randomness.key();
        let commit_slot = read_committed_randomness(
            &ctx.accounts.randomness,
            &config.election_vrf_config,
            &ctx.accounts.authority.key(),
        )?;
        ctx.accounts.turn_state.active_election_vrf_request = randomness_account;
        ctx.accounts.turn_state.active_election_commit_slot = commit_slot;
        emit!(ActiveElectionVrfRequested {
            turn_id: ctx.accounts.turn_state.turn_id,
            randomness_account,
        });
        Ok(())
    }

    /// Settle the active election by reading and verifying the revealed
    /// Switchboard randomness on-chain (trustless), then selecting one active
    /// rule uniformly from the surviving finalists using that verified value.
    pub fn settle_active_election(ctx: Context<SettleActiveElection>) -> Result<()> {
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        require!(
            ctx.accounts.turn_state.active_election_vrf_request != Pubkey::default(),
            TycheError::ElectionVrfNotRequested
        );

        let clock = Clock::get()?;
        let randomness_source = ctx.accounts.randomness.key();
        let randomness = verify_revealed_randomness(
            &ctx.accounts.randomness,
            &ctx.accounts.turn_state.active_election_vrf_request,
            &config.election_vrf_config,
            ctx.accounts.turn_state.active_election_commit_slot,
            &ctx.accounts.authority.key(),
            &clock,
        )?;

        let turn = &mut ctx.accounts.turn_state;
        let finalist_count = usize::from(turn.finalist_count);
        let survivors: Vec<u64> = (0..finalist_count)
            .filter(|index| !turn.finalist_eliminated[*index])
            .map(|index| turn.finalist_rule_ids[index])
            .collect();
        let survivor_index =
            derive_active_survivor_index(&randomness, turn.turn_id, survivors.len())?;
        let active_rule_id = survivors[survivor_index];
        let active_proposal_info = ctx
            .remaining_accounts
            .iter()
            .find(|account_info| {
                if *account_info.owner != ID {
                    return false;
                }
                let Ok(data) = account_info.try_borrow_data() else {
                    return false;
                };
                let mut data_ref: &[u8] = &data;
                RuleProposal::try_deserialize(&mut data_ref)
                    .map(|proposal| {
                        proposal.turn_id == turn.turn_id && proposal.rule_id == active_rule_id
                    })
                    .unwrap_or(false)
            })
            .ok_or(TycheError::RuleNotFinalist)?;
        let data = active_proposal_info.try_borrow_data()?;
        let mut data_ref: &[u8] = &data;
        let active = RuleProposal::try_deserialize(&mut data_ref)?;

        turn.active_rule_id = active_rule_id;
        turn.active_rule_hash = active.sanitized_text_hash;
        turn.frozen_rule_artifact_hash = active.compiled_artifact_hash;
        turn.active_election_vrf_fulfillment = randomness_source;
        turn.elected_survivor_index = survivor_index as u8;
        turn.elected_finalist_index =
            finalist_index(turn, active_rule_id).ok_or(TycheError::RuleNotFinalist)? as u8;

        emit!(ActiveElectionSettled {
            turn_id: turn.turn_id,
            active_rule_id,
            elected_survivor_index: turn.elected_survivor_index,
            randomness_source,
        });
        Ok(())
    }

    /// Recovery escape hatch for a lost Switchboard randomness account. A VRF
    /// request is two txs: (A) create+commit the randomness account, then (B)
    /// record its pubkey on the turn. If B lands but A's account is later gone
    /// (create rolled back, or the account was closed / rent-reclaimed on
    /// devnet), the matching `settle_*` can never reveal it and the settlement
    /// pipeline wedges forever — the request slot is non-default so the
    /// `request_*` instruction refuses to re-request.
    ///
    /// This clears the unsettled request slot for the given stage so the
    /// pipeline re-requests a fresh account. It is safe because it requires the
    /// supplied `randomness` account to be the exact one recorded on the turn
    /// AND to be genuinely non-existent on-chain (no lamports, empty data):
    /// a live pending or revealed account cannot be reset, so no in-flight
    /// randomness is ever discarded.
    pub fn reset_stale_vrf_request(
        ctx: Context<ResetStaleVrfRequest>,
        args: ResetStaleVrfRequestArgs,
    ) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, TycheError::ProtocolPaused);

        let recorded = match args.stage {
            VrfStage::FinalistElection => {
                require!(
                    ctx.accounts.turn_state.election_vrf_fulfillment == Pubkey::default(),
                    TycheError::VrfAlreadySettled
                );
                ctx.accounts.turn_state.election_vrf_request
            }
            VrfStage::ActiveElection => {
                require!(
                    ctx.accounts.turn_state.active_election_vrf_fulfillment == Pubkey::default(),
                    TycheError::VrfAlreadySettled
                );
                ctx.accounts.turn_state.active_election_vrf_request
            }
            VrfStage::Draw => {
                require!(
                    ctx.accounts.turn_state.draw_status == DrawStatus::Requested,
                    TycheError::VrfAlreadySettled
                );
                ctx.accounts.turn_state.draw_vrf_request
            }
        };
        let recorded_commit = match args.stage {
            VrfStage::FinalistElection => ctx.accounts.turn_state.election_commit_slot,
            VrfStage::ActiveElection => ctx.accounts.turn_state.active_election_commit_slot,
            VrfStage::Draw => ctx.accounts.turn_state.draw_commit_slot,
        };

        require!(
            recorded != Pubkey::default(),
            TycheError::ElectionVrfNotRequested
        );
        require!(
            recorded_commit != ORAO_COMMIT_MARKER,
            TycheError::PersistentRandomnessCannotBeReset
        );
        require_keys_eq!(
            ctx.accounts.randomness.key(),
            recorded,
            TycheError::RandomnessSourceMismatch
        );
        // Only a genuinely lost account may be reset. A live Switchboard
        // randomness account is rent-funded and owned by the Switchboard
        // program; an absent account is owned by the System program with zero
        // lamports and no data. Refuse to reset anything that still exists.
        require!(
            ctx.accounts.randomness.lamports() == 0 && ctx.accounts.randomness.data_is_empty(),
            TycheError::RandomnessAccountStillExists
        );

        let turn = &mut ctx.accounts.turn_state;
        match args.stage {
            VrfStage::FinalistElection => {
                turn.election_vrf_request = Pubkey::default();
                turn.election_commit_slot = 0;
            }
            VrfStage::ActiveElection => {
                turn.active_election_vrf_request = Pubkey::default();
                turn.active_election_commit_slot = 0;
            }
            VrfStage::Draw => {
                turn.draw_status = DrawStatus::NotRequested;
                turn.draw_vrf_request = Pubkey::default();
                turn.draw_commit_slot = 0;
                turn.draw_requested_at = 0;
            }
        }

        emit!(StaleVrfRequestReset {
            turn_id: turn.turn_id,
            stage: args.stage,
            randomness_account: recorded,
        });
        Ok(())
    }

    pub fn close_turn(ctx: Context<CloseTurn>) -> Result<()> {
        let clock = Clock::get()?;
        let config = &mut ctx.accounts.global_config;
        require!(!config.paused, TycheError::ProtocolPaused);
        require!(config.has_active_turn, TycheError::NoActiveTurn);
        require_eq!(
            config.active_turn_id,
            ctx.accounts.turn_state.turn_id,
            TycheError::InvalidTurnId
        );
        require!(
            ctx.accounts.turn_state.status == TurnStatus::Open,
            TycheError::TurnNotOpen
        );
        require!(
            clock.unix_timestamp >= ctx.accounts.turn_state.end_timestamp,
            TycheError::TurnNotEnded
        );

        ctx.accounts.turn_state.status = TurnStatus::Closed;
        config.has_active_turn = false;
        config.active_turn_id = 0;
        config.next_turn_id = config
            .next_turn_id
            .checked_add(1)
            .ok_or(TycheError::ArithmeticOverflow)?;
        config.active_turn_duration_index = next_cycle_index(config.active_turn_duration_index)?;

        emit!(TurnClosed {
            turn_id: ctx.accounts.turn_state.turn_id,
            prize_pool_amount_lamports: ctx.accounts.turn_state.prize_pool_amount_lamports,
        });
        Ok(())
    }

    /// Moves a closed turn's unallocated prize lamports into the open turn's
    /// prize vault, so a rolled-over pool is backed by real lamports in the
    /// vault that will pay it out.
    ///
    /// Each turn owns its own `prize_vault` PDA and only ever receives that
    /// turn's fee share. Rollover used to be pure off-chain accounting: the
    /// visible pool of the destination turn included the source turn's leftover
    /// while those lamports stayed in the source vault, so a winner of a turn
    /// with rollover held a claim its vault could not pay.
    ///
    /// The caller must declare the split it is carrying forward, and the
    /// declared total must equal the source vault's whole unreserved balance.
    /// That makes the instruction self-reconciling (off-chain accounting that
    /// disagrees with the chain fails loudly instead of half-funding a pool) and
    /// replay-safe (a drained source vault only accepts a 0/0 no-op sweep).
    pub fn sweep_prize_rollover(
        ctx: Context<SweepPrizeRollover>,
        args: SweepPrizeRolloverArgs,
    ) -> Result<()> {
        require!(
            !ctx.accounts.global_config.paused,
            TycheError::ProtocolPaused
        );
        require!(
            args.source_turn_id < args.destination_turn_id,
            TycheError::InvalidRolloverDirection
        );
        require!(
            ctx.accounts.source_turn_state.status == TurnStatus::Closed,
            TycheError::TurnNotClosed
        );
        require!(
            ctx.accounts.destination_turn_state.status == TurnStatus::Open,
            TycheError::TurnNotOpen
        );

        let total_lamports = args
            .original_lamports
            .checked_add(args.alternative_lamports)
            .ok_or(TycheError::ArithmeticOverflow)?;
        require!(
            total_lamports == ctx.accounts.source_prize_vault.total_collected_lamports,
            TycheError::RolloverAmountMismatch
        );

        // Only a vault that owes nothing may be swept. Every lamport above rent
        // exemption must be unreserved: any excess is a recorded claim's money,
        // whether reserved by `record_claim` or left over from a claim recorded
        // before that reservation existed. Carrying it into the next turn would
        // strand a winner behind a `claim_prize` their own vault can no longer
        // pay -- the very failure this instruction exists to prevent.
        let source_vault_info = ctx.accounts.source_prize_vault.to_account_info();
        let source_free_lamports = source_vault_info
            .lamports()
            .saturating_sub(Rent::get()?.minimum_balance(source_vault_info.data_len()));
        require!(
            source_free_lamports == ctx.accounts.source_prize_vault.total_collected_lamports,
            TycheError::PrizeVaultHasOutstandingClaims
        );

        if total_lamports > 0 {
            pay_from_vault(
                &ctx.accounts.source_prize_vault.to_account_info(),
                &ctx.accounts.destination_prize_vault.to_account_info(),
                total_lamports,
            )?;
        }

        ctx.accounts.source_prize_vault.total_collected_lamports = 0;
        let destination_vault = &mut ctx.accounts.destination_prize_vault;
        destination_vault.total_collected_lamports = destination_vault
            .total_collected_lamports
            .checked_add(total_lamports)
            .ok_or(TycheError::ArithmeticOverflow)?;

        let destination_turn = &mut ctx.accounts.destination_turn_state;
        destination_turn.original_pool_rollover_lamports = destination_turn
            .original_pool_rollover_lamports
            .checked_add(args.original_lamports)
            .ok_or(TycheError::ArithmeticOverflow)?;
        destination_turn.alternative_pool_rollover_lamports = destination_turn
            .alternative_pool_rollover_lamports
            .checked_add(args.alternative_lamports)
            .ok_or(TycheError::ArithmeticOverflow)?;

        emit!(PrizeRolloverSwept {
            source_turn_id: args.source_turn_id,
            destination_turn_id: args.destination_turn_id,
            original_lamports: args.original_lamports,
            alternative_lamports: args.alternative_lamports,
        });
        Ok(())
    }

    /// Assigns a closed turn's already-prefunded treasury share to the
    /// collecting seven-turn epoch. Paid actions deposited the SOL directly in
    /// the canonical fee pool; this instruction only reconciles accounting.
    /// A per-turn flag prevents replay; zero-fee turns are still reconciled.
    pub fn bridge_turn_treasury_fee(ctx: Context<BridgeTurnTreasuryFee>) -> Result<()> {
        let turn = &mut ctx.accounts.turn_state;
        require!(turn.status == TurnStatus::Closed, TycheError::TurnNotClosed);
        require!(
            !turn.treasury_fee_bridged,
            TycheError::TreasuryFeeAlreadyBridged
        );
        require_keys_eq!(
            ctx.accounts.token_config.game_authority,
            ctx.accounts.global_config.key(),
            TycheError::InvalidTokenomicsConfiguration
        );
        require_direct_fee_routing(&ctx.accounts.global_config, &ctx.accounts.treasury_vault)?;
        require_keys_eq!(
            ctx.accounts.global_config.treasury_address,
            ctx.accounts.distribution_vault.key(),
            TycheError::InvalidFeePool
        );
        require!(
            ctx.accounts.epoch.status == tokenomics_core::EpochStatus::Collecting,
            TycheError::InvalidTokenomicsEpoch
        );
        require!(
            (ctx.accounts.epoch.first_turn_id..=ctx.accounts.epoch.last_turn_id)
                .contains(&turn.turn_id),
            TycheError::InvalidTokenomicsEpoch
        );

        let amount_lamports = turn.treasury_fee_amount_lamports;
        if amount_lamports > 0 {
            require!(
                ctx.accounts.treasury_vault.total_collected_lamports >= amount_lamports,
                TycheError::InsufficientVaultBalance
            );
            let bump = ctx.accounts.global_config.bump;
            let signer_seeds: &[&[&[u8]]] = &[&[b"global_config", &[bump]]];
            tokenomics_core::cpi::record_external_treasury_fee(
                CpiContext::new_with_signer(
                    ctx.accounts.tokenomics_program.to_account_info(),
                    tokenomics_core::cpi::accounts::RecordExternalTreasuryFee {
                        game_authority: ctx.accounts.global_config.to_account_info(),
                        token_config: ctx.accounts.token_config.to_account_info(),
                        epoch: ctx.accounts.epoch.to_account_info(),
                        distribution_vault: ctx.accounts.distribution_vault.to_account_info(),
                    },
                    signer_seeds,
                ),
                turn.turn_id,
                amount_lamports,
            )?;
            ctx.accounts.treasury_vault.total_collected_lamports = ctx
                .accounts
                .treasury_vault
                .total_collected_lamports
                .checked_sub(amount_lamports)
                .ok_or(TycheError::ArithmeticOverflow)?;
        }

        turn.treasury_fee_bridged = true;
        emit!(TurnTreasuryFeeBridged {
            turn_id: turn.turn_id,
            epoch_id: ctx.accounts.epoch.epoch_id,
            amount_lamports,
        });
        Ok(())
    }

    /// Moves a fully reconciled seven-turn epoch from collecting to calculating.
    /// Tokenomics Core recognizes the Tyche GlobalConfig PDA as the game
    /// authority, so the external worker authorizes this wrapper while the CPI
    /// is signed only by the canonical PDA.
    pub fn close_tokenomics_epoch_collection(
        ctx: Context<CloseTokenomicsEpochCollection>,
        last_completed_turn_id: u64,
    ) -> Result<()> {
        require_keys_eq!(
            ctx.accounts.token_config.game_authority,
            ctx.accounts.global_config.key(),
            TycheError::InvalidTokenomicsConfiguration
        );
        require!(
            ctx.accounts.epoch.status == tokenomics_core::EpochStatus::Collecting,
            TycheError::InvalidTokenomicsEpoch
        );

        let bump = ctx.accounts.global_config.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"global_config", &[bump]]];
        tokenomics_core::cpi::close_epoch_collection(
            CpiContext::new_with_signer(
                ctx.accounts.tokenomics_program.to_account_info(),
                tokenomics_core::cpi::accounts::CloseEpochCollection {
                    game_authority: ctx.accounts.global_config.to_account_info(),
                    token_config: ctx.accounts.token_config.to_account_info(),
                    epoch: ctx.accounts.epoch.to_account_info(),
                },
                signer_seeds,
            ),
            last_completed_turn_id,
        )?;

        emit!(TokenomicsEpochCollectionClosed {
            epoch_id: ctx.accounts.epoch.epoch_id,
            last_completed_turn_id,
        });
        Ok(())
    }

    /// Permissionlessly settles the fixed proposal reward while binding the
    /// recipient to the proposal's recorded creator.
    pub fn settle_proposal_token_reward(ctx: Context<SettleProposalTokenReward>) -> Result<()> {
        let bump = ctx.accounts.global_config.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"global_config", &[bump]]];
        tokenomics_core::cpi::settle_action_reward(
            CpiContext::new_with_signer(
                ctx.accounts.tokenomics_program.to_account_info(),
                tokenomics_core::cpi::accounts::SettleActionReward {
                    payer: ctx.accounts.payer.to_account_info(),
                    game_authority: ctx.accounts.global_config.to_account_info(),
                    token_config: ctx.accounts.token_config.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    campaign: ctx.accounts.campaign.to_account_info(),
                    campaign_vault: ctx.accounts.campaign_vault.to_account_info(),
                    beneficiary_token_account: ctx
                        .accounts
                        .beneficiary_token_account
                        .to_account_info(),
                    reward_receipt: ctx.accounts.reward_receipt.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
                signer_seeds,
            ),
            tokenomics_core::SettleActionRewardArgs {
                action_id: ctx.accounts.rule_proposal.key().to_bytes(),
                kind: tokenomics_core::ActionRewardKind::Proposal,
            },
        )
    }

    /// Permissionlessly settles the fixed supporter reward while binding the
    /// recipient to the immutable vote record.
    pub fn settle_supporter_token_reward(ctx: Context<SettleSupporterTokenReward>) -> Result<()> {
        let bump = ctx.accounts.global_config.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"global_config", &[bump]]];
        tokenomics_core::cpi::settle_action_reward(
            CpiContext::new_with_signer(
                ctx.accounts.tokenomics_program.to_account_info(),
                tokenomics_core::cpi::accounts::SettleActionReward {
                    payer: ctx.accounts.payer.to_account_info(),
                    game_authority: ctx.accounts.global_config.to_account_info(),
                    token_config: ctx.accounts.token_config.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    campaign: ctx.accounts.campaign.to_account_info(),
                    campaign_vault: ctx.accounts.campaign_vault.to_account_info(),
                    beneficiary_token_account: ctx
                        .accounts
                        .beneficiary_token_account
                        .to_account_info(),
                    reward_receipt: ctx.accounts.reward_receipt.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
                signer_seeds,
            ),
            tokenomics_core::SettleActionRewardArgs {
                action_id: ctx.accounts.rule_vote.key().to_bytes(),
                kind: tokenomics_core::ActionRewardKind::Supporter,
            },
        )
    }

    pub fn settle_active_rule_token_rewards<'info>(
        ctx: Context<'_, '_, '_, 'info, SettleActiveRuleTokenRewards<'info>>,
        args: SettleActiveRuleTokenRewardsArgs,
    ) -> Result<()> {
        require_eq!(
            ctx.accounts.turn_state.turn_id,
            args.turn_id,
            TycheError::InvalidTurnId
        );
        require_eq!(
            ctx.accounts.turn_state.active_rule_id,
            ctx.accounts.rule_proposal.rule_id,
            TycheError::InvalidTokenomicsRewardFact
        );
        require!(
            ctx.accounts.turn_state.draw_status == DrawStatus::Fulfilled,
            TycheError::DrawNotSettleable
        );

        let bump = ctx.accounts.global_config.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"global_config", &[bump]]];
        tokenomics_core::cpi::settle_active_rule_rewards(
            CpiContext::new_with_signer(
                ctx.accounts.tokenomics_program.to_account_info(),
                tokenomics_core::cpi::accounts::SettleActiveRuleRewards {
                    payer: ctx.accounts.authority.to_account_info(),
                    game_authority: ctx.accounts.global_config.to_account_info(),
                    token_config: ctx.accounts.token_config.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    campaign: ctx.accounts.campaign.to_account_info(),
                    campaign_vault: ctx.accounts.campaign_vault.to_account_info(),
                    creator_token_account: ctx.accounts.creator_token_account.to_account_info(),
                    active_rule_reward: ctx.accounts.active_rule_reward.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
                signer_seeds,
            )
            .with_remaining_accounts(ctx.remaining_accounts.to_vec()),
            tokenomics_core::SettleActiveRuleRewardsArgs {
                turn_id: args.turn_id,
                alternative_prize_pool_lamports: args.alternative_prize_pool_lamports,
                winner_count: args.winner_count,
            },
        )
    }

    pub fn settle_referral_base_token_rewards(
        ctx: Context<SettleReferralBaseTokenRewards>,
        turn_id: u64,
    ) -> Result<()> {
        require_eq!(
            ctx.accounts.game_token.turn_id,
            turn_id,
            TycheError::InvalidTurnId
        );
        require!(
            ctx.accounts.game_token.guess_count > 0
                && ctx.accounts.attribution.attributed_at <= ctx.accounts.game_token.issued_at,
            TycheError::InvalidTokenomicsRewardFact
        );
        require_keys_eq!(
            ctx.accounts.game_token.player,
            ctx.accounts.attribution.invitee,
            TycheError::InvalidRewardBeneficiary
        );
        let bump = ctx.accounts.global_config.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"global_config", &[bump]]];
        tokenomics_core::cpi::settle_referral_base_rewards(
            CpiContext::new_with_signer(
                ctx.accounts.tokenomics_program.to_account_info(),
                tokenomics_core::cpi::accounts::SettleReferralBaseRewards {
                    game_authority: ctx.accounts.global_config.to_account_info(),
                    token_config: ctx.accounts.token_config.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    attribution: ctx.accounts.attribution.to_account_info(),
                    campaign: ctx.accounts.campaign.to_account_info(),
                    campaign_vault: ctx.accounts.campaign_vault.to_account_info(),
                    inviter_token_account: ctx.accounts.inviter_token_account.to_account_info(),
                    invitee_token_account: ctx.accounts.invitee_token_account.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                },
                signer_seeds,
            ),
            turn_id,
        )
    }

    pub fn record_referral_reward_contribution(
        ctx: Context<RecordReferralRewardContribution>,
        args: RecordReferralRewardContributionArgs,
    ) -> Result<()> {
        let bump = ctx.accounts.global_config.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"global_config", &[bump]]];
        tokenomics_core::cpi::record_invitee_first_round_reward(
            CpiContext::new_with_signer(
                ctx.accounts.tokenomics_program.to_account_info(),
                tokenomics_core::cpi::accounts::RecordInviteeFirstRoundReward {
                    payer: ctx.accounts.authority.to_account_info(),
                    game_authority: ctx.accounts.global_config.to_account_info(),
                    token_config: ctx.accounts.token_config.to_account_info(),
                    attribution: ctx.accounts.attribution.to_account_info(),
                    contribution: ctx.accounts.contribution.to_account_info(),
                    system_program: ctx.accounts.system_program.to_account_info(),
                },
                signer_seeds,
            ),
            args.turn_id,
            args.contribution_id,
            args.paid_atoms,
        )
    }

    pub fn settle_referral_bonus_token_reward(
        ctx: Context<SettleReferralBonusTokenReward>,
        turn_id: u64,
    ) -> Result<()> {
        let bump = ctx.accounts.global_config.bump;
        let signer_seeds: &[&[&[u8]]] = &[&[b"global_config", &[bump]]];
        tokenomics_core::cpi::settle_referral_bonus(
            CpiContext::new_with_signer(
                ctx.accounts.tokenomics_program.to_account_info(),
                tokenomics_core::cpi::accounts::SettleReferralBonus {
                    game_authority: ctx.accounts.global_config.to_account_info(),
                    token_config: ctx.accounts.token_config.to_account_info(),
                    mint: ctx.accounts.mint.to_account_info(),
                    attribution: ctx.accounts.attribution.to_account_info(),
                    campaign: ctx.accounts.campaign.to_account_info(),
                    campaign_vault: ctx.accounts.campaign_vault.to_account_info(),
                    inviter_token_account: ctx.accounts.inviter_token_account.to_account_info(),
                    token_program: ctx.accounts.token_program.to_account_info(),
                },
                signer_seeds,
            ),
            turn_id,
        )
    }

    pub fn force_skip_legacy_active_turn(ctx: Context<ForceSkipLegacyActiveTurn>) -> Result<()> {
        let config = &mut ctx.accounts.global_config;
        require!(!config.paused, TycheError::ProtocolPaused);
        require!(config.has_active_turn, TycheError::NoActiveTurn);

        let active_turn_id = config.active_turn_id;
        let active_turn_id_bytes = active_turn_id.to_le_bytes();
        let (expected_turn_state, _) = Pubkey::find_program_address(
            &[b"turn".as_ref(), active_turn_id_bytes.as_ref()],
            ctx.program_id,
        );
        require_keys_eq!(
            ctx.accounts.turn_state.key(),
            expected_turn_state,
            TycheError::InvalidTurnId
        );
        require_keys_eq!(
            *ctx.accounts.turn_state.to_account_info().owner,
            crate::ID,
            TycheError::InvalidTurnId
        );
        require!(
            ctx.accounts.turn_state.to_account_info().data_len() < 8 + TurnState::INIT_SPACE,
            TycheError::ActiveTurnStateNotLegacy
        );

        config.has_active_turn = false;
        config.active_turn_id = 0;
        config.next_turn_id = active_turn_id
            .checked_add(1)
            .ok_or(TycheError::ArithmeticOverflow)?;
        config.active_turn_duration_index = next_cycle_index(config.active_turn_duration_index)?;

        emit!(LegacyActiveTurnSkipped {
            turn_id: active_turn_id,
            legacy_data_len: ctx.accounts.turn_state.to_account_info().data_len() as u32,
            expected_data_len: (8 + TurnState::INIT_SPACE) as u32,
        });
        Ok(())
    }

    /// Request a draw for a turn once it has ended (Switchboard On-Demand commit
    /// step). Verifies the supplied randomness account is a genuine Switchboard
    /// account from the configured draw queue, then records its address and
    /// committed `seed_slot` so `settle_draw` can verify the revealed value
    /// on-chain. Idempotent retries are allowed only from `NotRequested` or
    /// `Failed`.
    pub fn request_draw(ctx: Context<RequestDraw>) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, TycheError::ProtocolPaused);

        let randomness_account = ctx.accounts.randomness.key();
        let commit_slot = read_committed_randomness(
            &ctx.accounts.randomness,
            &config.draw_vrf_config,
            &ctx.accounts.authority.key(),
        )?;

        let clock = Clock::get()?;
        let turn = &mut ctx.accounts.turn_state;
        require!(
            clock.unix_timestamp >= turn.end_timestamp,
            TycheError::TurnNotEnded
        );
        require!(
            matches!(
                turn.draw_status,
                DrawStatus::NotRequested | DrawStatus::Failed
            ),
            TycheError::DrawNotRequestable
        );

        turn.draw_status = DrawStatus::Requested;
        turn.draw_vrf_request = randomness_account;
        turn.draw_commit_slot = commit_slot;
        turn.draw_requested_at = clock.unix_timestamp;
        turn.draw_failure_code = 0;

        emit!(DrawRequested {
            turn_id: turn.turn_id,
            randomness_account,
            requested_at: turn.draw_requested_at,
        });
        Ok(())
    }

    /// Settle a requested draw by reading and verifying the revealed Switchboard
    /// On-Demand randomness on-chain (trustless, PRD §5.6), then deterministically
    /// deriving the 6 unique drawn numbers (1..=100). The randomness value is no
    /// longer supplied by the authority; it is read from the bound Switchboard
    /// account and must be revealed in the current slot.
    pub fn settle_draw(ctx: Context<SettleDraw>) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, TycheError::ProtocolPaused);
        require!(
            ctx.accounts.turn_state.draw_status == DrawStatus::Requested,
            TycheError::DrawNotSettleable
        );

        let clock = Clock::get()?;
        let randomness_source = ctx.accounts.randomness.key();
        let value = verify_revealed_randomness(
            &ctx.accounts.randomness,
            &ctx.accounts.turn_state.draw_vrf_request,
            &config.draw_vrf_config,
            ctx.accounts.turn_state.draw_commit_slot,
            &ctx.accounts.authority.key(),
            &clock,
        )?;

        let turn = &mut ctx.accounts.turn_state;
        let numbers = derive_draw_numbers(&value, turn.turn_id);
        validate_guess(&numbers)?;

        turn.draw_result = numbers;
        turn.draw_randomness = value;
        turn.draw_vrf_fulfillment = randomness_source;
        turn.drawn_at = clock.unix_timestamp;
        turn.draw_status = DrawStatus::Fulfilled;

        emit!(DrawSettled {
            turn_id: turn.turn_id,
            draw_result: numbers,
            randomness_source,
            drawn_at: turn.drawn_at,
        });
        Ok(())
    }

    /// Mark a requested draw as failed without corrupting turn state, so it can
    /// be retried with a fresh randomness account through `request_draw`.
    pub fn fail_draw(ctx: Context<FailDraw>, failure_code: u8) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, TycheError::ProtocolPaused);
        require!(failure_code != 0, TycheError::InvalidDrawFailureCode);

        let clock = Clock::get()?;
        let turn = &mut ctx.accounts.turn_state;
        require!(
            turn.draw_status == DrawStatus::Requested,
            TycheError::DrawNotSettleable
        );
        require!(
            turn.draw_commit_slot != ORAO_COMMIT_MARKER,
            TycheError::PersistentRandomnessCannotBeReset
        );

        turn.draw_status = DrawStatus::Failed;
        turn.draw_failure_code = failure_code;

        emit!(DrawFailed {
            turn_id: turn.turn_id,
            failure_code,
            failed_at: clock.unix_timestamp,
        });
        Ok(())
    }

    /// Authority posts an off-chain-computed winner payout. Creator and voter
    /// rewards are token rewards owned by Tokenomics Core and are deliberately
    /// rejected here so the game treasury cannot accrue competing SOL
    /// liabilities.
    pub fn record_claim(ctx: Context<RecordClaim>, args: RecordClaimArgs) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, TycheError::ProtocolPaused);
        require!(
            args.kind == ClaimKind::WinnerPayout,
            TycheError::ClaimKindMismatch
        );
        require!(
            args.claimant != Pubkey::default(),
            TycheError::InvalidClaimant
        );
        require!(
            ctx.accounts.turn_state.draw_status == DrawStatus::Fulfilled,
            TycheError::DrawNotSettleable
        );
        require!(
            args.amount_lamports >= config.minimum_claim_threshold_lamports,
            TycheError::ClaimBelowMinimum
        );

        // Reserve the payout against the turn's prize vault at record time.
        // `total_collected_lamports` is the vault's *unreserved* balance: every
        // recorded claim subtracts from it here and `claim_prize` only moves
        // lamports. Without this the authority could record a liability the
        // vault cannot pay -- which is exactly what happens when the visible
        // pool includes rollover whose lamports still sit in an earlier turn's
        // vault -- and the winner would only discover it when their own
        // `claim_prize` failed.
        let prize_vault = &mut ctx.accounts.prize_vault;
        require!(
            args.amount_lamports <= prize_vault.total_collected_lamports,
            TycheError::ClaimExceedsPrizeVault
        );
        prize_vault.total_collected_lamports = prize_vault
            .total_collected_lamports
            .checked_sub(args.amount_lamports)
            .ok_or(TycheError::ArithmeticOverflow)?;

        let clock = Clock::get()?;
        let claim = &mut ctx.accounts.claim;
        claim.turn_id = args.turn_id;
        claim.claimant = args.claimant;
        claim.kind = args.kind;
        claim.amount_lamports = args.amount_lamports;
        claim.status = ClaimState::Available;
        claim.recorded_at = clock.unix_timestamp;
        claim.claimed_at = 0;
        claim.bump = ctx.bumps.claim;

        emit!(ClaimRecorded {
            turn_id: args.turn_id,
            claimant: args.claimant,
            kind: args.kind,
            amount_lamports: args.amount_lamports,
        });
        Ok(())
    }

    /// Pull a recorded winner payout from the turn's prize vault. Signed by the
    /// claimant wallet (pull-payment). The amount is whatever the authority
    /// recorded; double-claim is blocked by the `Claimed` state flag.
    pub fn claim_prize(ctx: Context<ClaimPrize>, turn_id: u64) -> Result<()> {
        require!(
            !ctx.accounts.global_config.paused,
            TycheError::ProtocolPaused
        );
        require!(
            ctx.accounts.claim.kind == ClaimKind::WinnerPayout,
            TycheError::ClaimKindMismatch
        );
        require!(
            ctx.accounts.claim.status == ClaimState::Available,
            TycheError::ClaimNotAvailable
        );

        let amount = ctx.accounts.claim.amount_lamports;
        let claimant_key = ctx.accounts.claimant.key();
        let clock = Clock::get()?;

        // Checks-Effects-Interactions: mark claimed before moving lamports.
        let claim = &mut ctx.accounts.claim;
        claim.status = ClaimState::Claimed;
        claim.claimed_at = clock.unix_timestamp;

        let prize_vault_info = ctx.accounts.prize_vault.to_account_info();
        pay_from_vault(
            &prize_vault_info,
            &ctx.accounts.claimant.to_account_info(),
            amount,
        )?;
        // `record_claim` already reserved this payout, so the unreserved balance
        // does not move here. Vaults whose claims were recorded before that
        // reservation existed still over-report; clamp to what the account can
        // actually back so a legacy vault cannot reserve lamports twice.
        let unreserved_ceiling = prize_vault_info
            .lamports()
            .saturating_sub(Rent::get()?.minimum_balance(prize_vault_info.data_len()));
        ctx.accounts.prize_vault.total_collected_lamports = ctx
            .accounts
            .prize_vault
            .total_collected_lamports
            .min(unreserved_ceiling);

        emit!(ClaimSettled {
            turn_id,
            claimant: claimant_key,
            kind: ClaimKind::WinnerPayout,
            amount_lamports: amount,
        });
        Ok(())
    }

    /// Release an unclaimed winner payout whose claim window has closed, so its
    /// lamports rejoin the vault's unreserved balance and roll forward with the
    /// next `sweep_prize_rollover` (PRD §8.7.7).
    ///
    /// Without this the reservation is permanent: an abandoned payout would pin
    /// its lamports in a closed turn's vault forever, and — because a vault that
    /// still owes a claim may not be swept — it would also block every later
    /// rollover out of that turn.
    ///
    /// The window closes when EITHER bound is reached, whichever comes first:
    /// `CLAIM_WINDOW_TURNS` turns have started since the claim's turn, or
    /// `CLAIM_WINDOW_SECONDS` have elapsed since it was recorded. Expiry is
    /// terminal and blocks `claim_prize`, so the deadline is checked here rather
    /// than trusted from the caller.
    pub fn expire_claim(ctx: Context<ExpireClaim>, args: ExpireClaimArgs) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, TycheError::ProtocolPaused);
        require!(
            ctx.accounts.claim.kind == ClaimKind::WinnerPayout,
            TycheError::ClaimKindMismatch
        );
        require!(
            ctx.accounts.claim.status == ClaimState::Available,
            TycheError::ClaimNotAvailable
        );

        let clock = Clock::get()?;
        let turns_elapsed = config.next_turn_id.saturating_sub(args.turn_id);
        let seconds_elapsed = clock
            .unix_timestamp
            .saturating_sub(ctx.accounts.claim.recorded_at);
        require!(
            turns_elapsed >= CLAIM_WINDOW_TURNS || seconds_elapsed >= CLAIM_WINDOW_SECONDS,
            TycheError::ClaimWindowStillOpen
        );

        let amount = ctx.accounts.claim.amount_lamports;
        let claim = &mut ctx.accounts.claim;
        claim.status = ClaimState::Expired;

        // Give the reservation back. Clamp to what the account actually holds:
        // a claim recorded before `record_claim` reserved anything never took
        // lamports out of the counter, so adding them would invent balance the
        // vault does not have.
        let prize_vault_info = ctx.accounts.prize_vault.to_account_info();
        let free_lamports = prize_vault_info
            .lamports()
            .saturating_sub(Rent::get()?.minimum_balance(prize_vault_info.data_len()));
        let prize_vault = &mut ctx.accounts.prize_vault;
        prize_vault.total_collected_lamports = prize_vault
            .total_collected_lamports
            .saturating_add(amount)
            .min(free_lamports);

        emit!(ClaimExpired {
            turn_id: args.turn_id,
            claimant: args.claimant,
            amount_lamports: amount,
            released_at: clock.unix_timestamp,
        });
        Ok(())
    }

    /// Legacy migration-only path for creator/voter SOL claims recorded by an
    /// older deployment. New records reject these kinds; current rewards live
    /// in Tokenomics Core.
    pub fn claim_reward(ctx: Context<ClaimReward>, turn_id: u64, kind: ClaimKind) -> Result<()> {
        require!(
            !ctx.accounts.global_config.paused,
            TycheError::ProtocolPaused
        );
        require!(
            kind != ClaimKind::WinnerPayout,
            TycheError::ClaimKindMismatch
        );
        require!(
            ctx.accounts.claim.kind == kind,
            TycheError::ClaimKindMismatch
        );
        require!(
            ctx.accounts.claim.status == ClaimState::Available,
            TycheError::ClaimNotAvailable
        );

        let amount = ctx.accounts.claim.amount_lamports;
        let claimant_key = ctx.accounts.claimant.key();
        let clock = Clock::get()?;

        let claim = &mut ctx.accounts.claim;
        claim.status = ClaimState::Claimed;
        claim.claimed_at = clock.unix_timestamp;

        pay_from_vault(
            &ctx.accounts.treasury_vault.to_account_info(),
            &ctx.accounts.claimant.to_account_info(),
            amount,
        )?;
        ctx.accounts.treasury_vault.total_collected_lamports = ctx
            .accounts
            .treasury_vault
            .total_collected_lamports
            .saturating_sub(amount);

        emit!(ClaimSettled {
            turn_id,
            claimant: claimant_key,
            kind,
            amount_lamports: amount,
        });
        Ok(())
    }

    /// TEST-ONLY (devnet): repair a `global_config` account whose on-chain
    /// layout predates the current `GlobalConfig`. Such an account wedges every
    /// authority turn instruction because the stored `bump` no longer matches
    /// the canonical PDA, so `bump = global_config.bump` fails `ConstraintSeeds`.
    ///
    /// Compiled ONLY under the `devnet-test` feature and excluded from
    /// production builds. Even when present it is authority-gated: it
    /// authenticates against the two layout-stable regions of every GlobalConfig
    /// version — the 8-byte account discriminator and the `authority` pubkey
    /// (the first field) — then reallocs the account to the current layout and
    /// rewrites it with the canonical devnet test configuration (mirrors
    /// `examples/devnet_bootstrap`). `next_turn_id` lets the caller skip past
    /// any pre-existing turn PDAs.
    #[cfg(feature = "devnet-test")]
    pub fn reinitialize_global_config_for_migration(
        ctx: Context<ReinitializeGlobalConfigForMigration>,
        next_turn_id: u64,
    ) -> Result<()> {
        use anchor_lang::Discriminator;

        require!(next_turn_id >= 1, TycheError::InvalidTurnId);

        let info = ctx.accounts.global_config.to_account_info();
        require_keys_eq!(
            *info.owner,
            crate::ID,
            TycheError::InvalidGlobalConfigAccount
        );

        // Authenticate using only layout-stable bytes: the 8-byte discriminator
        // (offset 0) and the `authority` pubkey, which is the first field
        // (offset 8..40) in every GlobalConfig version.
        {
            let data = info.try_borrow_data()?;
            require!(
                data.len() >= 40 && &data[0..8] == GlobalConfig::DISCRIMINATOR,
                TycheError::InvalidGlobalConfigAccount
            );
            let stored_authority = Pubkey::try_from(&data[8..40])
                .map_err(|_| error!(TycheError::InvalidGlobalConfigAccount))?;
            require_keys_eq!(
                stored_authority,
                ctx.accounts.authority.key(),
                TycheError::Unauthorized
            );
        }

        // Grow the account to the current layout and keep it rent-exempt,
        // funding any shortfall from the authority.
        let needed = 8 + GlobalConfig::INIT_SPACE;
        let min_balance = Rent::get()?.minimum_balance(needed);
        let current = info.lamports();
        if current < min_balance {
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.authority.to_account_info(),
                        to: info.clone(),
                    },
                ),
                min_balance - current,
            )?;
        }
        // `realloc` is deprecated in favor of `resize` in newer toolchains, but
        // `realloc` remains available across the pinned versions; keep it and
        // silence the lint to avoid a toolchain-version-dependent API.
        #[allow(deprecated)]
        {
            info.realloc(needed, true)?;
        }

        let config = GlobalConfig {
            authority: ctx.accounts.authority.key(),
            pending_authority: None,
            treasury_address: ctx.accounts.authority.key(),
            draw_vrf_config: crate::ID,
            election_vrf_config: crate::ID,
            guess_submission_fee_lamports: 10_000_000,
            rule_proposal_fee_lamports: 20_000_000,
            rule_removal_fee_lamports: 50_000_000,
            vote_fee_lamports: 5_000_000,
            treasury_fee_bps: 500,
            // Production turn = 24h: phase 1 (create rules + pick numbers)
            // runs until the 9167-bps cutoff (~22h), phase 2 (finalist
            // shortlist, elimination voting, active rule, draw at turn end)
            // fills the remaining ~2h (PRD §5.4).
            turn_duration_cycle: [86_400, 86_400, 86_400, 86_400],
            active_turn_duration_index: 0,
            rule_election_cutoff_bps: 9_167,
            guess_cutoff_bps: 9_167,
            max_rule_tokens: 1_000,
            top_voted_finalist_count: 3,
            random_finalist_count: 7,
            max_rule_proposals_per_wallet_per_turn: 0,
            max_votes_per_wallet_per_turn: 0,
            minimum_claim_threshold_lamports: 5_000,
            claim_window_turns: 4,
            claim_window_days: 7,
            creator_reward_cap_lamports: 250_000_000,
            min_votes_creator_self_remove: 5,
            min_votes_third_party_remove: 15,
            next_turn_id,
            active_turn_id: 0,
            has_active_turn: false,
            paused: false,
            bump: ctx.bumps.global_config,
        };

        let mut data = info.try_borrow_mut_data()?;
        let mut cursor: &mut [u8] = &mut data;
        config.try_serialize(&mut cursor)?;

        emit!(GlobalConfigInitialized {
            authority: config.authority,
            treasury_address: config.treasury_address,
        });
        Ok(())
    }

    // ---------------------------------------------------------------
    // Founder Pass accounting core (PRD-FOUNDER-PASS-NFT.md, FP1)
    //
    // These four instructions add state and governance only. None of them
    // waives a fee, moves a lamport, or pays JDR — that is FP2/FP3. The
    // ordinary game instructions above are untouched, so no existing account
    // bytes or instruction semantics change (§6.3).
    // ---------------------------------------------------------------

    /// Creates the governed Founder Pass configuration in its birth state:
    /// every §14 decision unresolved and benefits disabled.
    ///
    /// The config is deliberately created empty rather than from caller
    /// arguments, so a deployment cannot be born with a guessed standard,
    /// collection, or policy. Each decision is then recorded by an explicit,
    /// reviewable `configure_founder_pass` call.
    pub fn initialize_founder_pass_config(ctx: Context<InitializeFounderPassConfig>) -> Result<()> {
        require_program_upgrade_authority(
            &ctx.accounts.program_data,
            ctx.accounts.governance_authority.key(),
        )?;

        let config = &mut ctx.accounts.founder_pass_config;
        config.version = FOUNDER_PASS_ACCOUNT_VERSION;
        config.enabled = false;
        config.paused = false;
        config.asset_standard = FounderPassAssetStandard::Unset;
        config.asset_program_id = Pubkey::default();
        config.canonical_collection = Pubkey::default();
        config.campaign = Pubkey::default();
        config.max_supply = FOUNDER_PASS_MAX_SUPPLY;
        config.supply_enforcement = FounderPassSupplyEnforcement::Unset;
        config.allowlist_commitment = [0u8; 32];
        config.vote_allowance = FOUNDER_PASS_VOTE_ALLOWANCE;
        config.rule_proposal_allowance = FOUNDER_PASS_RULE_PROPOSAL_ALLOWANCE;
        config.bet_allowance = FOUNDER_PASS_BET_ALLOWANCE;
        config.active_turn_window = FOUNDER_PASS_ACTIVE_TURN_WINDOW;
        config.activation_turn_id = 0;
        config.ownership_snapshot_policy = FounderPassOwnershipSnapshotPolicy::Unset;
        config.boostable_reward_kinds = 0;
        config.fee_waiver_funding = FounderPassFeeWaiverFunding::Unset;
        config.max_pass_vote_actions_per_rule_per_turn = 0;
        config.max_passes_per_wallet_per_turn = 0;
        config.bump = ctx.bumps.founder_pass_config;

        emit!(FounderPassConfigInitialized {
            authority: ctx.accounts.governance_authority.key(),
            unresolved_decisions: config.unresolved_decisions(),
        });
        Ok(())
    }

    /// Records the governed resolution of the §14 decisions.
    ///
    /// The whole policy is written at once so every governance action is a
    /// complete, reviewable statement rather than a partial diff. Allowances
    /// and maximum supply are NOT arguments: §3.1/§3.2 confirm them, so they
    /// stay pinned to their constants and governance cannot widen them here.
    ///
    /// Refused once benefits are enabled: §4.3 requires a governed migration
    /// that preserves every asset's used allowances, not a config overwrite.
    pub fn configure_founder_pass(
        ctx: Context<ConfigureFounderPass>,
        args: ConfigureFounderPassArgs,
    ) -> Result<()> {
        require_program_upgrade_authority(
            &ctx.accounts.program_data,
            ctx.accounts.governance_authority.key(),
        )?;

        let config = &mut ctx.accounts.founder_pass_config;
        require!(!config.enabled, TycheError::FounderPassAlreadyActivated);

        // A per-rule/per-turn concentration limit above the lifetime vote
        // allowance would not constrain anything.
        require!(
            u32::from(args.max_pass_vote_actions_per_rule_per_turn) <= FOUNDER_PASS_VOTE_ALLOWANCE,
            TycheError::InvalidFounderPassConcentrationLimit
        );
        // Upper bound only. Zero stays writable here because it is the §14
        // "unresolved" sentinel that `set_founder_pass_activation` refuses;
        // rejecting it at configure time would make an honest partial
        // governance record impossible. The ceiling is what
        // `FounderPassWalletTurn` can represent exactly, so governance cannot
        // store a policy the programme would have to truncate at use.
        require!(
            usize::from(args.max_passes_per_wallet_per_turn)
                <= FOUNDER_PASS_WALLET_TURN_PASS_SLOTS,
            TycheError::InvalidFounderPassConcentrationLimit
        );

        config.asset_standard = args.asset_standard;
        config.asset_program_id = args.asset_program_id;
        config.canonical_collection = args.canonical_collection;
        config.campaign = args.campaign;
        config.supply_enforcement = args.supply_enforcement;
        config.allowlist_commitment = args.allowlist_commitment;
        config.ownership_snapshot_policy = args.ownership_snapshot_policy;
        config.boostable_reward_kinds = args.boostable_reward_kinds;
        config.fee_waiver_funding = args.fee_waiver_funding;
        config.max_pass_vote_actions_per_rule_per_turn = args.max_pass_vote_actions_per_rule_per_turn;
        config.max_passes_per_wallet_per_turn = args.max_passes_per_wallet_per_turn;

        emit!(FounderPassConfigured {
            authority: ctx.accounts.governance_authority.key(),
            asset_standard: config.asset_standard,
            asset_program_id: config.asset_program_id,
            canonical_collection: config.canonical_collection,
            campaign: config.campaign,
            unresolved_decisions: config.unresolved_decisions(),
        });
        Ok(())
    }

    /// Sets the activation and pause state.
    ///
    /// This is where §14 is enforced: enabling requires every
    /// activation-gating decision to be resolved, so an unresolved decision
    /// cannot silently select a default. Pausing is always permitted and
    /// rewrites no historical usage (§6.1).
    pub fn set_founder_pass_activation(
        ctx: Context<SetFounderPassActivation>,
        args: SetFounderPassActivationArgs,
    ) -> Result<()> {
        require_program_upgrade_authority(
            &ctx.accounts.program_data,
            ctx.accounts.governance_authority.key(),
        )?;

        let config = &mut ctx.accounts.founder_pass_config;
        let unresolved_decisions = config.unresolved_decisions();

        if args.enabled {
            require!(
                unresolved_decisions == 0,
                TycheError::FounderPassDecisionsUnresolved
            );
            validate_founder_pass_allowances(
                config.vote_allowance,
                config.rule_proposal_allowance,
                config.bet_allowance,
                config.active_turn_window,
            )?;
            // FP-D9 must be not merely "non-zero" but enforceable by the
            // accounts FP2 actually writes, otherwise activation would promise
            // a concentration policy the programme cannot apply (§10).
            validate_founder_pass_concentration_policy(
                config.max_pass_vote_actions_per_rule_per_turn,
                config.max_passes_per_wallet_per_turn,
            )?;
            require!(args.activation_turn_id >= 1, TycheError::InvalidTurnId);
            // The activation turn anchors the one window every pass shares, so
            // it is write-once. Disabling and re-enabling must not shift that
            // window under holders who already paid for a fixed span.
            if config.activation_turn_id == 0 {
                config.activation_turn_id = args.activation_turn_id;
            } else {
                require!(
                    args.activation_turn_id == config.activation_turn_id,
                    TycheError::FounderPassActivationTurnImmutable
                );
            }
            // Reject an anchor whose window would overflow before it is stored.
            founder_pass_turn_window(config.activation_turn_id)?;
        }

        config.enabled = args.enabled;
        config.paused = args.paused;

        emit!(FounderPassActivationChanged {
            authority: ctx.accounts.governance_authority.key(),
            enabled: config.enabled,
            paused: config.paused,
            activation_turn_id: config.activation_turn_id,
            unresolved_decisions,
        });
        Ok(())
    }

    /// Creates the per-asset usage account for a verified Founder Pass.
    ///
    /// Seeded by the individual asset address, never by a wallet, so quotas
    /// belong to the NFT and survive a transfer (§3.2). The signer must be the
    /// asset's current on-chain owner and also pays the account's rent; the
    /// account is permanent, so a second call for the same asset fails rather
    /// than resetting anything.
    pub fn initialize_founder_pass_usage(ctx: Context<InitializeFounderPassUsage>) -> Result<()> {
        let config = &ctx.accounts.founder_pass_config;
        require!(
            config.enabled && !config.paused,
            TycheError::FounderPassInactive
        );
        validate_founder_pass_allowances(
            config.vote_allowance,
            config.rule_proposal_allowance,
            config.bet_allowance,
            config.active_turn_window,
        )?;

        let facts = verify_founder_pass_asset(
            config.asset_standard,
            &config.asset_program_id,
            &config.canonical_collection,
            &ctx.accounts.owner.key(),
            &ctx.accounts.asset.to_account_info(),
        )?;

        let usage = &mut ctx.accounts.founder_pass_usage;
        usage.version = FOUNDER_PASS_ACCOUNT_VERSION;
        usage.asset = facts.asset;
        usage.collection = facts.collection;
        usage.vote_actions_used = 0;
        usage.rule_proposals_used = 0;
        usage.bets_used = 0;
        usage.bump = ctx.bumps.founder_pass_usage;

        emit!(FounderPassUsageInitialized {
            asset: usage.asset,
            collection: usage.collection,
            owner: facts.owner,
        });
        Ok(())
    }

    // ---------------------------------------------------------------
    // Founder Pass game benefits (PRD-FOUNDER-PASS-NFT.md, FP2)
    //
    // Five pass-aware variants of the ordinary paid actions, exactly as §6.3
    // asks. The ordinary instructions above are unchanged and keep working;
    // these perform the same eligibility, phase, sequence, and content checks
    // through the same shared bodies, then waive the Tyche fee and update the
    // usage PDA in the same transaction.
    //
    // They stay inert until governance activates benefits, because
    // `plan_founder_pass_action` refuses while `enabled` is false, while any
    // §14 decision is unresolved, or while the asset standard is `Unset`.
    // ---------------------------------------------------------------

    /// Creates the sponsor vault used by the `SponsorFunded` fee-waiver policy.
    pub fn initialize_founder_pass_sponsor_vault(
        ctx: Context<InitializeFounderPassSponsorVault>,
    ) -> Result<()> {
        require_program_upgrade_authority(
            &ctx.accounts.program_data,
            ctx.accounts.governance_authority.key(),
        )?;

        let vault = &mut ctx.accounts.founder_pass_sponsor_vault;
        vault.version = FOUNDER_PASS_ACCOUNT_VERSION;
        vault.total_funded_lamports = 0;
        vault.total_spent_lamports = 0;
        vault.bump = ctx.bumps.founder_pass_sponsor_vault;

        emit!(FounderPassSponsorVaultInitialized {
            authority: ctx.accounts.governance_authority.key(),
        });
        Ok(())
    }

    /// Adds lamports to the sponsor vault.
    ///
    /// Deliberately open to any signer: funding only ever *increases* what the
    /// sponsor can cover and authorizes nothing by itself. The balance is the
    /// §8 "explicit funded limit", so topping it up is the one operation that
    /// must not require a governance round trip for the benefit to keep working.
    pub fn fund_founder_pass_sponsor_vault(
        ctx: Context<FundFounderPassSponsorVault>,
        amount_lamports: u64,
    ) -> Result<()> {
        require!(amount_lamports > 0, TycheError::InvalidFounderPassSponsorAmount);

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.funder.to_account_info(),
                    to: ctx.accounts.founder_pass_sponsor_vault.to_account_info(),
                },
            ),
            amount_lamports,
        )?;

        let vault = &mut ctx.accounts.founder_pass_sponsor_vault;
        vault.total_funded_lamports = vault
            .total_funded_lamports
            .checked_add(amount_lamports)
            .ok_or(TycheError::ArithmeticOverflow)?;

        emit!(FounderPassSponsorVaultFunded {
            funder: ctx.accounts.funder.key(),
            amount_lamports,
            total_funded_lamports: vault.total_funded_lamports,
        });
        Ok(())
    }

    /// Returns unspent sponsor lamports to a governed recipient.
    pub fn withdraw_founder_pass_sponsor_vault(
        ctx: Context<WithdrawFounderPassSponsorVault>,
        amount_lamports: u64,
    ) -> Result<()> {
        require_program_upgrade_authority(
            &ctx.accounts.program_data,
            ctx.accounts.governance_authority.key(),
        )?;
        require!(amount_lamports > 0, TycheError::InvalidFounderPassSponsorAmount);

        pay_from_vault(
            &ctx.accounts.founder_pass_sponsor_vault.to_account_info(),
            &ctx.accounts.recipient.to_account_info(),
            amount_lamports,
        )?;

        emit!(FounderPassSponsorVaultWithdrawn {
            authority: ctx.accounts.governance_authority.key(),
            recipient: ctx.accounts.recipient.key(),
            amount_lamports,
        });
        Ok(())
    }

    /// Fee-free first guess of a turn, funded by a Founder Pass (§3.2 bets).
    ///
    /// §5.2: a free bet still creates the ordinary Game Token through the
    /// existing first-guess flow, so the pass grants no shortcut past the
    /// Game Token gate.
    pub fn submit_guess_with_founder_pass(
        ctx: Context<SubmitGuessWithFounderPass>,
        args: SubmitGuessArgs,
    ) -> Result<()> {
        require!(args.sequence == 1, TycheError::InvalidActionSequence);
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        validate_turn_action_window(
            clock.unix_timestamp,
            &ctx.accounts.turn_state,
            config.guess_cutoff_bps,
        )?;
        validate_guess(&args.numbers)?;
        require_direct_fee_routing(config, &ctx.accounts.treasury_vault)?;

        let turn_id = ctx.accounts.turn_state.turn_id;
        let player = ctx.accounts.player.key();
        let otherwise_due_lamports = repeated_action_fee_lamports(
            config.guess_submission_fee_lamports,
            turn_id,
            args.sequence,
        )?;

        bind_founder_pass_wallet_turn(
            &mut ctx.accounts.founder_pass_wallet_turn,
            player,
            turn_id,
            ctx.bumps.founder_pass_wallet_turn,
        )?;
        let plan = plan_founder_pass_action(
            &ctx.accounts.founder_pass_config,
            &ctx.accounts.founder_pass_usage,
            &ctx.accounts.founder_pass_wallet_turn,
            &ctx.accounts.founder_pass_sponsor_vault.to_account_info(),
            &ctx.accounts.asset.to_account_info(),
            player,
            turn_id,
            FounderPassBenefit::Bet,
            otherwise_due_lamports,
            config.treasury_fee_bps,
        )?;

        let fee = ActionFeeOutcome::waived(&plan.settlement);
        let sponsor_vault_info = ctx.accounts.founder_pass_sponsor_vault.to_account_info();
        let fee_pool_info = ctx.accounts.fee_pool.to_account_info();
        let prize_vault_info = ctx.accounts.prize_vault.to_account_info();
        commit_founder_pass_action(
            &plan,
            &mut ctx.accounts.founder_pass_usage,
            &mut ctx.accounts.founder_pass_wallet_turn,
            &sponsor_vault_info,
            &mut ctx.accounts.founder_pass_sponsor_vault,
            &fee_pool_info,
            &prize_vault_info,
        )?;

        apply_first_guess(
            &mut ctx.accounts.turn_state,
            &mut ctx.accounts.treasury_vault,
            &mut ctx.accounts.prize_vault,
            &mut ctx.accounts.player_guess,
            &mut ctx.accounts.game_token,
            player,
            &args,
            fee,
            clock.unix_timestamp,
            ctx.bumps.player_guess,
            ctx.bumps.game_token,
        )?;

        emit_founder_pass_benefit_used(
            &plan,
            turn_id,
            FounderPassBenefit::Bet,
            &ctx.accounts.founder_pass_usage,
        );
        Ok(())
    }

    /// Fee-free additional guess, funded by a Founder Pass (§3.2 bets).
    pub fn submit_additional_guess_with_founder_pass(
        ctx: Context<SubmitAdditionalGuessWithFounderPass>,
        args: SubmitGuessArgs,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        validate_turn_action_window(
            clock.unix_timestamp,
            &ctx.accounts.turn_state,
            config.guess_cutoff_bps,
        )?;
        validate_guess(&args.numbers)?;
        validate_game_token(
            &ctx.accounts.game_token,
            ctx.accounts.turn_state.turn_id,
            ctx.accounts.player.key(),
        )?;
        let expected_sequence = ctx
            .accounts
            .game_token
            .guess_count
            .checked_add(1)
            .ok_or(TycheError::ArithmeticOverflow)?;
        require!(
            args.sequence == expected_sequence,
            TycheError::InvalidActionSequence
        );
        require_direct_fee_routing(config, &ctx.accounts.treasury_vault)?;

        let turn_id = ctx.accounts.turn_state.turn_id;
        let player = ctx.accounts.player.key();
        let otherwise_due_lamports = repeated_action_fee_lamports(
            config.guess_submission_fee_lamports,
            turn_id,
            args.sequence,
        )?;

        bind_founder_pass_wallet_turn(
            &mut ctx.accounts.founder_pass_wallet_turn,
            player,
            turn_id,
            ctx.bumps.founder_pass_wallet_turn,
        )?;
        let plan = plan_founder_pass_action(
            &ctx.accounts.founder_pass_config,
            &ctx.accounts.founder_pass_usage,
            &ctx.accounts.founder_pass_wallet_turn,
            &ctx.accounts.founder_pass_sponsor_vault.to_account_info(),
            &ctx.accounts.asset.to_account_info(),
            player,
            turn_id,
            FounderPassBenefit::Bet,
            otherwise_due_lamports,
            config.treasury_fee_bps,
        )?;

        let fee = ActionFeeOutcome::waived(&plan.settlement);
        let sponsor_vault_info = ctx.accounts.founder_pass_sponsor_vault.to_account_info();
        let fee_pool_info = ctx.accounts.fee_pool.to_account_info();
        let prize_vault_info = ctx.accounts.prize_vault.to_account_info();
        commit_founder_pass_action(
            &plan,
            &mut ctx.accounts.founder_pass_usage,
            &mut ctx.accounts.founder_pass_wallet_turn,
            &sponsor_vault_info,
            &mut ctx.accounts.founder_pass_sponsor_vault,
            &fee_pool_info,
            &prize_vault_info,
        )?;

        apply_additional_guess(
            &mut ctx.accounts.turn_state,
            &mut ctx.accounts.treasury_vault,
            &mut ctx.accounts.prize_vault,
            &mut ctx.accounts.player_guess,
            &mut ctx.accounts.game_token,
            player,
            &args,
            fee,
            clock.unix_timestamp,
            ctx.bumps.player_guess,
        )?;

        emit_founder_pass_benefit_used(
            &plan,
            turn_id,
            FounderPassBenefit::Bet,
            &ctx.accounts.founder_pass_usage,
        );
        Ok(())
    }

    /// Fee-free rule proposal, funded by a Founder Pass (§3.2 rule proposals).
    pub fn propose_rule_with_founder_pass(
        ctx: Context<ProposeRuleWithFounderPass>,
        args: ProposeRuleArgs,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        validate_turn_action_window(
            clock.unix_timestamp,
            &ctx.accounts.turn_state,
            config.rule_election_cutoff_bps,
        )?;
        validate_game_token(
            &ctx.accounts.game_token,
            ctx.accounts.turn_state.turn_id,
            ctx.accounts.proposer.key(),
        )?;
        validate_rule(
            &args.sanitized_text,
            &args.sanitized_text_hash,
            &args.preflight_result_hash,
            args.token_count,
            config.max_rule_tokens,
        )?;
        require_direct_fee_routing(config, &ctx.accounts.treasury_vault)?;

        let turn_id = ctx.accounts.turn_state.turn_id;
        let proposer = ctx.accounts.proposer.key();
        let proposal_sequence = ctx
            .accounts
            .game_token
            .used_for_rule_proposal_count
            .checked_add(1)
            .ok_or(TycheError::ArithmeticOverflow)?;
        let otherwise_due_lamports = repeated_action_fee_lamports(
            config.rule_proposal_fee_lamports,
            turn_id,
            proposal_sequence,
        )?;

        bind_founder_pass_wallet_turn(
            &mut ctx.accounts.founder_pass_wallet_turn,
            proposer,
            turn_id,
            ctx.bumps.founder_pass_wallet_turn,
        )?;
        let plan = plan_founder_pass_action(
            &ctx.accounts.founder_pass_config,
            &ctx.accounts.founder_pass_usage,
            &ctx.accounts.founder_pass_wallet_turn,
            &ctx.accounts.founder_pass_sponsor_vault.to_account_info(),
            &ctx.accounts.asset.to_account_info(),
            proposer,
            turn_id,
            FounderPassBenefit::RuleProposal,
            otherwise_due_lamports,
            config.treasury_fee_bps,
        )?;

        let fee = ActionFeeOutcome::waived(&plan.settlement);
        let bump = ctx.bumps.rule_proposal;
        let sponsor_vault_info = ctx.accounts.founder_pass_sponsor_vault.to_account_info();
        let fee_pool_info = ctx.accounts.fee_pool.to_account_info();
        let prize_vault_info = ctx.accounts.prize_vault.to_account_info();
        commit_founder_pass_action(
            &plan,
            &mut ctx.accounts.founder_pass_usage,
            &mut ctx.accounts.founder_pass_wallet_turn,
            &sponsor_vault_info,
            &mut ctx.accounts.founder_pass_sponsor_vault,
            &fee_pool_info,
            &prize_vault_info,
        )?;

        apply_rule_proposal(
            &mut ctx.accounts.turn_state,
            &mut ctx.accounts.treasury_vault,
            &mut ctx.accounts.prize_vault,
            &mut ctx.accounts.rule_proposal,
            &mut ctx.accounts.game_token,
            proposer,
            args,
            fee,
            clock.unix_timestamp,
            bump,
        )?;

        emit_founder_pass_benefit_used(
            &plan,
            turn_id,
            FounderPassBenefit::RuleProposal,
            &ctx.accounts.founder_pass_usage,
        );
        Ok(())
    }

    /// Fee-free approval vote, funded by a Founder Pass (§3.2 votes).
    ///
    /// §5.2: the vote counts as exactly one ordinary vote. The §10
    /// concentration limit is applied first, so a wallet cannot aim an
    /// unbounded number of fee-free votes at one rule.
    pub fn vote_rule_with_founder_pass(
        ctx: Context<VoteRuleWithFounderPass>,
        args: VoteRuleArgs,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        let finalist_index = validate_approval_vote_window(
            clock.unix_timestamp,
            config,
            &ctx.accounts.turn_state,
            ctx.accounts.rule_proposal.rule_id,
        )?;
        validate_game_token(
            &ctx.accounts.game_token,
            ctx.accounts.turn_state.turn_id,
            ctx.accounts.voter.key(),
        )?;
        require!(
            matches!(
                ctx.accounts.rule_proposal.state,
                RuleState::Proposed | RuleState::Eligible
            ),
            TycheError::RuleNotVoteable
        );
        require!(args.sequence > 0, TycheError::InvalidActionSequence);
        require_direct_fee_routing(config, &ctx.accounts.treasury_vault)?;

        let turn_id = ctx.accounts.turn_state.turn_id;
        let rule_id = ctx.accounts.rule_proposal.rule_id;
        let voter = ctx.accounts.voter.key();
        let otherwise_due_lamports =
            repeated_action_fee_lamports(config.vote_fee_lamports, turn_id, args.sequence)?;

        bind_founder_pass_wallet_turn(
            &mut ctx.accounts.founder_pass_wallet_turn,
            voter,
            turn_id,
            ctx.bumps.founder_pass_wallet_turn,
        )?;
        bind_founder_pass_vote_concentration(
            &mut ctx.accounts.founder_pass_vote_concentration,
            voter,
            turn_id,
            rule_id,
            ctx.bumps.founder_pass_vote_concentration,
        )?;
        let concentration = plan_founder_pass_vote_concentration(
            &ctx.accounts.founder_pass_vote_concentration.view(),
            FounderPassVoteKind::Approval,
            ctx.accounts
                .founder_pass_config
                .max_pass_vote_actions_per_rule_per_turn,
        )?;
        let plan = plan_founder_pass_action(
            &ctx.accounts.founder_pass_config,
            &ctx.accounts.founder_pass_usage,
            &ctx.accounts.founder_pass_wallet_turn,
            &ctx.accounts.founder_pass_sponsor_vault.to_account_info(),
            &ctx.accounts.asset.to_account_info(),
            voter,
            turn_id,
            FounderPassBenefit::Vote,
            otherwise_due_lamports,
            config.treasury_fee_bps,
        )?;

        let fee = ActionFeeOutcome::waived(&plan.settlement);
        let bump = ctx.bumps.rule_vote;
        let sponsor_vault_info = ctx.accounts.founder_pass_sponsor_vault.to_account_info();
        let fee_pool_info = ctx.accounts.fee_pool.to_account_info();
        let prize_vault_info = ctx.accounts.prize_vault.to_account_info();
        commit_founder_pass_action(
            &plan,
            &mut ctx.accounts.founder_pass_usage,
            &mut ctx.accounts.founder_pass_wallet_turn,
            &sponsor_vault_info,
            &mut ctx.accounts.founder_pass_sponsor_vault,
            &fee_pool_info,
            &prize_vault_info,
        )?;
        ctx.accounts
            .founder_pass_vote_concentration
            .approval_vote_actions = concentration.approval_vote_actions;

        apply_rule_vote(
            &mut ctx.accounts.turn_state,
            &mut ctx.accounts.treasury_vault,
            &mut ctx.accounts.prize_vault,
            &mut ctx.accounts.rule_proposal,
            &mut ctx.accounts.rule_vote,
            &mut ctx.accounts.game_token,
            voter,
            args.sequence,
            finalist_index,
            fee,
            clock.unix_timestamp,
            bump,
        )?;

        emit_founder_pass_benefit_used(
            &plan,
            turn_id,
            FounderPassBenefit::Vote,
            &ctx.accounts.founder_pass_usage,
        );
        Ok(())
    }

    /// Fee-free elimination vote, funded by a Founder Pass (§3.2 votes).
    pub fn eliminate_vote_rule_with_founder_pass(
        ctx: Context<EliminateVoteRuleWithFounderPass>,
        args: EliminateVoteRuleArgs,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        validate_game_token(
            &ctx.accounts.game_token,
            ctx.accounts.turn_state.turn_id,
            ctx.accounts.voter.key(),
        )?;
        require!(
            ctx.accounts.turn_state.finalist_count > 0
                && ctx.accounts.turn_state.elimination_window_end_timestamp > 0,
            TycheError::EliminationWindowNotOpen
        );
        require!(
            clock.unix_timestamp < ctx.accounts.turn_state.elimination_window_end_timestamp,
            TycheError::EliminationWindowNotOpen
        );
        let index = finalist_index(&ctx.accounts.turn_state, ctx.accounts.rule_proposal.rule_id)
            .ok_or(TycheError::RuleNotFinalist)?;
        require!(
            !ctx.accounts.turn_state.finalist_eliminated[index],
            TycheError::RuleAlreadyEliminated
        );
        require!(args.sequence > 0, TycheError::InvalidActionSequence);
        require_direct_fee_routing(config, &ctx.accounts.treasury_vault)?;

        let turn_id = ctx.accounts.turn_state.turn_id;
        let rule_id = ctx.accounts.rule_proposal.rule_id;
        let voter = ctx.accounts.voter.key();
        let otherwise_due_lamports =
            repeated_action_fee_lamports(config.vote_fee_lamports, turn_id, args.sequence)?;

        bind_founder_pass_wallet_turn(
            &mut ctx.accounts.founder_pass_wallet_turn,
            voter,
            turn_id,
            ctx.bumps.founder_pass_wallet_turn,
        )?;
        bind_founder_pass_vote_concentration(
            &mut ctx.accounts.founder_pass_vote_concentration,
            voter,
            turn_id,
            rule_id,
            ctx.bumps.founder_pass_vote_concentration,
        )?;
        let concentration = plan_founder_pass_vote_concentration(
            &ctx.accounts.founder_pass_vote_concentration.view(),
            FounderPassVoteKind::Elimination,
            ctx.accounts
                .founder_pass_config
                .max_pass_vote_actions_per_rule_per_turn,
        )?;
        let plan = plan_founder_pass_action(
            &ctx.accounts.founder_pass_config,
            &ctx.accounts.founder_pass_usage,
            &ctx.accounts.founder_pass_wallet_turn,
            &ctx.accounts.founder_pass_sponsor_vault.to_account_info(),
            &ctx.accounts.asset.to_account_info(),
            voter,
            turn_id,
            FounderPassBenefit::Vote,
            otherwise_due_lamports,
            config.treasury_fee_bps,
        )?;

        let fee = ActionFeeOutcome::waived(&plan.settlement);
        let bump = ctx.bumps.rule_elimination_vote;
        let sponsor_vault_info = ctx.accounts.founder_pass_sponsor_vault.to_account_info();
        let fee_pool_info = ctx.accounts.fee_pool.to_account_info();
        let prize_vault_info = ctx.accounts.prize_vault.to_account_info();
        commit_founder_pass_action(
            &plan,
            &mut ctx.accounts.founder_pass_usage,
            &mut ctx.accounts.founder_pass_wallet_turn,
            &sponsor_vault_info,
            &mut ctx.accounts.founder_pass_sponsor_vault,
            &fee_pool_info,
            &prize_vault_info,
        )?;
        ctx.accounts
            .founder_pass_vote_concentration
            .elimination_vote_actions = concentration.elimination_vote_actions;

        apply_rule_elimination_vote(
            &mut ctx.accounts.turn_state,
            &mut ctx.accounts.treasury_vault,
            &mut ctx.accounts.prize_vault,
            &mut ctx.accounts.rule_elimination_vote,
            rule_id,
            voter,
            args.sequence,
            index,
            fee,
            clock.unix_timestamp,
            bump,
        )?;

        emit_founder_pass_benefit_used(
            &plan,
            turn_id,
            FounderPassBenefit::Vote,
            &ctx.accounts.founder_pass_usage,
        );
        Ok(())
    }
}

fn validate_live_turn(config: &GlobalConfig, turn: &TurnState) -> Result<()> {
    require!(!config.paused, TycheError::ProtocolPaused);
    require!(config.has_active_turn, TycheError::NoActiveTurn);
    require_eq!(
        config.active_turn_id,
        turn.turn_id,
        TycheError::InvalidTurnId
    );
    require!(turn.status == TurnStatus::Open, TycheError::TurnNotOpen);
    Ok(())
}

fn planned_turn_end_timestamp(turn: &TurnState) -> Result<i64> {
    turn.start_timestamp
        .checked_add(i64::from(turn.turn_duration_seconds))
        .ok_or(error!(TycheError::ArithmeticOverflow))
}

fn rule_election_cutoff_timestamp(config: &GlobalConfig, turn: &TurnState) -> Result<i64> {
    let cutoff_elapsed = i128::from(turn.turn_duration_seconds)
        .checked_mul(i128::from(config.rule_election_cutoff_bps))
        .ok_or(TycheError::ArithmeticOverflow)?
        .checked_div(i128::from(BASIS_POINTS_DENOMINATOR))
        .ok_or(TycheError::ArithmeticOverflow)?;
    let cutoff_timestamp = i128::from(turn.start_timestamp)
        .checked_add(cutoff_elapsed)
        .ok_or(TycheError::ArithmeticOverflow)?;
    i64::try_from(cutoff_timestamp).map_err(|_| error!(TycheError::ArithmeticOverflow))
}

fn phase_two_duration_seconds(config: &GlobalConfig, turn: &TurnState) -> Result<i64> {
    planned_turn_end_timestamp(turn)?
        .checked_sub(rule_election_cutoff_timestamp(config, turn)?)
        .ok_or(error!(TycheError::ArithmeticOverflow))
}

fn validate_turn_action_window(now: i64, turn: &TurnState, cutoff_bps: u16) -> Result<()> {
    validate_action_window(
        now,
        turn.start_timestamp,
        planned_turn_end_timestamp(turn)?,
        cutoff_bps,
    )
}

fn validate_approval_vote_window(
    now: i64,
    config: &GlobalConfig,
    turn: &TurnState,
    rule_id: u64,
) -> Result<Option<usize>> {
    if validate_turn_action_window(now, turn, config.rule_election_cutoff_bps).is_ok() {
        return Ok(None);
    }

    let index = finalist_index(turn, rule_id).ok_or(TycheError::RuleNotVoteable)?;
    require!(
        turn.finalist_count > 0 && turn.elimination_window_end_timestamp > 0,
        TycheError::EliminationWindowNotOpen
    );
    require!(
        now < turn.elimination_window_end_timestamp,
        TycheError::EliminationWindowNotOpen
    );
    require!(
        !turn.finalist_eliminated[index],
        TycheError::RuleAlreadyEliminated
    );
    Ok(Some(index))
}

fn submit_guess_with_game_token_init(
    ctx: Context<SubmitGuess>,
    args: SubmitGuessArgs,
) -> Result<()> {
    let clock = Clock::get()?;
    let config = &ctx.accounts.global_config;
    validate_live_turn(config, &ctx.accounts.turn_state)?;
    validate_turn_action_window(
        clock.unix_timestamp,
        &ctx.accounts.turn_state,
        config.guess_cutoff_bps,
    )?;
    validate_guess(&args.numbers)?;
    let fee_lamports = repeated_action_fee_lamports(
        config.guess_submission_fee_lamports,
        ctx.accounts.turn_state.turn_id,
        args.sequence,
    )?;

    collect_fee(
        &ctx.accounts.player,
        config,
        &ctx.accounts.treasury_vault,
        &ctx.accounts.fee_pool,
        &ctx.accounts.prize_vault,
        &ctx.accounts.system_program,
        fee_lamports,
    )?;
    let fee = ActionFeeOutcome::paid(fee_lamports, config.treasury_fee_bps)?;
    let player = ctx.accounts.player.key();

    apply_first_guess(
        &mut ctx.accounts.turn_state,
        &mut ctx.accounts.treasury_vault,
        &mut ctx.accounts.prize_vault,
        &mut ctx.accounts.player_guess,
        &mut ctx.accounts.game_token,
        player,
        &args,
        fee,
        clock.unix_timestamp,
        ctx.bumps.player_guess,
        ctx.bumps.game_token,
    )
}

fn validate_game_token(game_token: &GameToken, turn_id: u64, player: Pubkey) -> Result<()> {
    require_eq!(game_token.turn_id, turn_id, TycheError::InvalidGameToken);
    require_keys_eq!(game_token.player, player, TycheError::InvalidGameToken);
    require!(
        game_token.status == GameTokenStatus::Active,
        TycheError::InactiveGameToken
    );
    Ok(())
}

fn repeated_action_fee_lamports(
    base_fee_lamports: u64,
    turn_id: u64,
    sequence: u64,
) -> Result<u64> {
    require!(sequence > 0, TycheError::InvalidActionSequence);

    if turn_id < VOTE_FEE_START_TURN && sequence == 1 {
        return Ok(0);
    }

    let paid_index = sequence
        .checked_sub(1)
        .ok_or(TycheError::ArithmeticOverflow)?;
    let mut fee = base_fee_lamports;
    for _ in 0..paid_index {
        fee = fee
            .checked_mul(REPEATED_ACTION_FEE_MULTIPLIER)
            .ok_or(TycheError::ArithmeticOverflow)?;
    }
    Ok(fee)
}

fn finalist_index(turn: &TurnState, rule_id: u64) -> Option<usize> {
    turn.finalist_rule_ids[..usize::from(turn.finalist_count)]
        .iter()
        .position(|candidate_rule_id| *candidate_rule_id == rule_id)
}

fn hash_rule_ids(domain: &[u8], rule_ids: &[u64]) -> [u8; 32] {
    let mut input = Vec::with_capacity(domain.len() + 8 + rule_ids.len() * 8);
    input.extend_from_slice(domain);
    input.extend_from_slice(&(rule_ids.len() as u64).to_le_bytes());
    for rule_id in rule_ids {
        input.extend_from_slice(&rule_id.to_le_bytes());
    }
    hash(&input).to_bytes()
}

fn hash_elimination_state(turn: &TurnState) -> [u8; 32] {
    let count = usize::from(turn.finalist_count);
    let mut input = Vec::with_capacity(24 + count * 17);
    input.extend_from_slice(b"eliminated_finalists_v1");
    input.extend_from_slice(&(count as u64).to_le_bytes());
    for index in 0..count {
        input.extend_from_slice(&turn.finalist_rule_ids[index].to_le_bytes());
        input.extend_from_slice(&turn.finalist_approval_vote_counts[index].to_le_bytes());
        input.extend_from_slice(&turn.finalist_elimination_vote_counts[index].to_le_bytes());
        input.push(u8::from(turn.finalist_eliminated[index]));
    }
    hash(&input).to_bytes()
}

fn derive_active_survivor_index(
    randomness: &[u8; 32],
    turn_id: u64,
    survivor_count: usize,
) -> Result<usize> {
    require!(survivor_count > 0, TycheError::NoSurvivingFinalist);
    let digest = hash(
        &[
            randomness.as_slice(),
            &turn_id.to_le_bytes(),
            b"active_survivor_v1",
        ]
        .concat(),
    )
    .to_bytes();
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&digest[..8]);
    Ok((u64::from_le_bytes(bytes) % survivor_count as u64) as usize)
}

fn require_election_cutoff_reached(config: &GlobalConfig, turn: &TurnState) -> Result<()> {
    validate_live_turn(config, turn)?;
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= rule_election_cutoff_timestamp(config, turn)?,
        TycheError::ElectionCutoffNotReached
    );
    Ok(())
}

fn read_election_candidates<'accounts, 'info>(
    accounts: &'accounts [AccountInfo<'info>],
    turn_id: u64,
) -> Result<Vec<ElectionCandidate>> {
    let mut candidates = Vec::with_capacity(accounts.len());

    for account_info in accounts {
        require_keys_eq!(*account_info.owner, ID, TycheError::InvalidTurnId);
        let data = account_info.try_borrow_data()?;
        let mut data_ref: &[u8] = &data;
        let proposal = RuleProposal::try_deserialize(&mut data_ref)?;
        require_eq!(proposal.turn_id, turn_id, TycheError::InvalidTurnId);
        candidates.push(ElectionCandidate {
            rule_id: proposal.rule_id,
            sanitized_text_hash: proposal.sanitized_text_hash,
            compiled_artifact_hash: proposal.compiled_artifact_hash,
            vote_count: proposal.vote_count,
            report_count: proposal.report_count,
            created_at: proposal.created_at,
            is_eligible_state: proposal.state == RuleState::Eligible,
            is_precompiled_valid: proposal.precompilation_status == PrecompilationStatus::Passed,
        });
    }

    Ok(candidates)
}

/// What one game action records and books for its Tyche fee.
///
/// The ordinary paid path and the FP2 pass-funded path differ *only* here. A
/// waived action records zero, because §6.3 requires the recorded action fee to
/// be zero when waived, and books whatever §8's governed funding policy
/// actually paid — which is the full split under `SponsorFunded` and nothing at
/// all under `ReducedTurnPool`. Everything else about the action (eligibility,
/// phase, sequence, content checks, tally, and account writes) is shared, so
/// the two paths cannot drift apart.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ActionFeeOutcome {
    recorded_fee_lamports: u64,
    treasury_lamports: u64,
    prize_lamports: u64,
}

impl ActionFeeOutcome {
    /// The ordinary path: the player paid `fee_lamports` and it is booked and
    /// recorded in full.
    fn paid(fee_lamports: u64, treasury_fee_bps: u16) -> Result<Self> {
        let (treasury_lamports, prize_lamports) = split_fee(fee_lamports, treasury_fee_bps)?;
        Ok(Self {
            recorded_fee_lamports: fee_lamports,
            treasury_lamports,
            prize_lamports,
        })
    }

    /// The FP2 path: nothing is recorded against the player, and only what the
    /// sponsor actually paid is booked.
    fn waived(settlement: &FounderPassWaiverSettlement) -> Self {
        Self {
            recorded_fee_lamports: 0,
            treasury_lamports: settlement.treasury_lamports,
            prize_lamports: settlement.prize_lamports,
        }
    }
}

/// Credits one action's fee split into the turn and vault ledgers.
///
/// Extracted verbatim from the five call sites that previously repeated it, so
/// the pass-aware variants book SOL through exactly the same arithmetic and in
/// the same order as the paid ones.
fn credit_fee_ledgers(
    turn_state: &mut TurnState,
    treasury_vault: &mut TreasuryVault,
    prize_vault: &mut PrizeVault,
    fee: ActionFeeOutcome,
) -> Result<()> {
    turn_state.treasury_fee_amount_lamports = turn_state
        .treasury_fee_amount_lamports
        .checked_add(fee.treasury_lamports)
        .ok_or(TycheError::ArithmeticOverflow)?;
    treasury_vault.total_collected_lamports = treasury_vault
        .total_collected_lamports
        .checked_add(fee.treasury_lamports)
        .ok_or(TycheError::ArithmeticOverflow)?;
    prize_vault.total_collected_lamports = prize_vault
        .total_collected_lamports
        .checked_add(fee.prize_lamports)
        .ok_or(TycheError::ArithmeticOverflow)?;
    turn_state.prize_pool_amount_lamports = turn_state
        .prize_pool_amount_lamports
        .checked_add(fee.prize_lamports)
        .ok_or(TycheError::ArithmeticOverflow)?;
    Ok(())
}

// ------------------------------------------------------------------
// Shared action bodies (FP2, §6.3)
//
// Each of these is the part of a game action that a Founder Pass does not
// change: the account writes, the tally, the sequence advance, and the event.
// The ordinary paid instruction and its pass-aware variant both call the same
// function and differ only in the `ActionFeeOutcome` they hand it, which is
// what §6.3 means by "pass-aware paths perform all existing checks and update
// the standard action sequence, game account, vote tally, and usage PDA in one
// transaction".
// ------------------------------------------------------------------

/// First guess of a turn: writes the guess and mints the Game Token.
#[allow(clippy::too_many_arguments)]
fn apply_first_guess<'info>(
    turn_state: &mut TurnState,
    treasury_vault: &mut TreasuryVault,
    prize_vault: &mut PrizeVault,
    player_guess: &mut Account<'info, PlayerGuess>,
    game_token: &mut Account<'info, GameToken>,
    player: Pubkey,
    args: &SubmitGuessArgs,
    fee: ActionFeeOutcome,
    now: i64,
    player_guess_bump: u8,
    game_token_bump: u8,
) -> Result<()> {
    let guess_key = player_guess.key();
    let game_token_key = game_token.key();
    let turn_id = turn_state.turn_id;

    player_guess.turn_id = turn_id;
    player_guess.player = player;
    player_guess.sequence = args.sequence;
    player_guess.fee_lamports = fee.recorded_fee_lamports;
    player_guess.numbers = args.numbers;
    player_guess.submitted_at = now;
    player_guess.game_token = game_token_key;
    player_guess.verification_status = VerificationStatus::Pending;
    player_guess.original_rule_result = false;
    player_guess.alternative_rule_result = false;
    player_guess.claim_status = ClaimStatus::Unavailable;
    player_guess.bump = player_guess_bump;

    game_token.turn_id = turn_id;
    game_token.player = player;
    game_token.issuing_guess = guess_key;
    game_token.issued_at = now;
    game_token.guess_count = args.sequence;
    game_token.used_for_rule_proposal_count = 0;
    game_token.used_for_vote_count = 0;
    game_token.status = GameTokenStatus::Active;
    game_token.close_authority = player;
    game_token.bump = game_token_bump;

    credit_fee_ledgers(turn_state, treasury_vault, prize_vault, fee)?;

    emit!(GuessSubmitted {
        turn_id,
        player,
        sequence: args.sequence,
        fee_lamports: fee.recorded_fee_lamports,
        guess: args.numbers,
        game_token: game_token_key,
    });
    Ok(())
}

/// A later guess in the same turn, against an existing Game Token.
#[allow(clippy::too_many_arguments)]
fn apply_additional_guess<'info>(
    turn_state: &mut TurnState,
    treasury_vault: &mut TreasuryVault,
    prize_vault: &mut PrizeVault,
    player_guess: &mut Account<'info, PlayerGuess>,
    game_token: &mut Account<'info, GameToken>,
    player: Pubkey,
    args: &SubmitGuessArgs,
    fee: ActionFeeOutcome,
    now: i64,
    player_guess_bump: u8,
) -> Result<()> {
    let turn_id = turn_state.turn_id;
    let game_token_key = game_token.key();

    player_guess.turn_id = turn_id;
    player_guess.player = player;
    player_guess.sequence = args.sequence;
    player_guess.fee_lamports = fee.recorded_fee_lamports;
    player_guess.numbers = args.numbers;
    player_guess.submitted_at = now;
    player_guess.game_token = game_token_key;
    player_guess.verification_status = VerificationStatus::Pending;
    player_guess.original_rule_result = false;
    player_guess.alternative_rule_result = false;
    player_guess.claim_status = ClaimStatus::Unavailable;
    player_guess.bump = player_guess_bump;

    let guess_key = player_guess.key();
    game_token.issuing_guess = guess_key;
    game_token.guess_count = args.sequence;

    credit_fee_ledgers(turn_state, treasury_vault, prize_vault, fee)?;

    emit!(GuessSubmitted {
        turn_id,
        player,
        sequence: args.sequence,
        fee_lamports: fee.recorded_fee_lamports,
        guess: args.numbers,
        game_token: game_token_key,
    });
    Ok(())
}

/// Writes a rule proposal and advances the proposer's per-turn proposal count.
#[allow(clippy::too_many_arguments)]
fn apply_rule_proposal(
    turn_state: &mut TurnState,
    treasury_vault: &mut TreasuryVault,
    prize_vault: &mut PrizeVault,
    rule_proposal: &mut RuleProposal,
    game_token: &mut GameToken,
    proposer: Pubkey,
    args: ProposeRuleArgs,
    fee: ActionFeeOutcome,
    now: i64,
    bump: u8,
) -> Result<()> {
    let turn_id = turn_state.turn_id;

    rule_proposal.rule_id = args.rule_id;
    rule_proposal.turn_id = turn_id;
    rule_proposal.proposer = proposer;
    rule_proposal.sanitized_text_hash = args.sanitized_text_hash;
    rule_proposal.sanitized_text = args.sanitized_text;
    rule_proposal.normalized_text_hash = args.normalized_text_hash;
    rule_proposal.official_interpretation_hash = args.official_interpretation_hash;
    rule_proposal.compiled_artifact_hash = [0; 32];
    rule_proposal.token_count = args.token_count;
    rule_proposal.vote_count = 0;
    rule_proposal.report_count = 0;
    rule_proposal.state = RuleState::Proposed;
    rule_proposal.preflight_result_hash = args.preflight_result_hash;
    rule_proposal.precompilation_status = PrecompilationStatus::Pending;
    rule_proposal.created_at = now;
    rule_proposal.bump = bump;

    // §8: the action still advances its ordinary sequence so that a later paid
    // proposal quotes the correct next escalated fee.
    game_token.used_for_rule_proposal_count = game_token
        .used_for_rule_proposal_count
        .checked_add(1)
        .ok_or(TycheError::ArithmeticOverflow)?;

    credit_fee_ledgers(turn_state, treasury_vault, prize_vault, fee)?;

    emit!(RuleProposed {
        turn_id,
        rule_id: rule_proposal.rule_id,
        proposer,
        sanitized_text_hash: rule_proposal.sanitized_text_hash,
    });
    Ok(())
}

/// Writes an approval vote and moves the ordinary tallies.
///
/// §5.2: a waived vote adds exactly one ordinary vote. Nothing about the tally,
/// side, rule, or sequence semantics depends on how the fee was funded.
#[allow(clippy::too_many_arguments)]
fn apply_rule_vote(
    turn_state: &mut TurnState,
    treasury_vault: &mut TreasuryVault,
    prize_vault: &mut PrizeVault,
    rule_proposal: &mut RuleProposal,
    rule_vote: &mut RuleVote,
    game_token: &mut GameToken,
    voter: Pubkey,
    sequence: u64,
    finalist_index: Option<usize>,
    fee: ActionFeeOutcome,
    now: i64,
    bump: u8,
) -> Result<()> {
    let turn_id = turn_state.turn_id;
    let rule_id = rule_proposal.rule_id;

    rule_vote.turn_id = turn_id;
    rule_vote.rule_id = rule_id;
    rule_vote.voter = voter;
    rule_vote.sequence = sequence;
    rule_vote.fee_lamports = fee.recorded_fee_lamports;
    rule_vote.created_at = now;
    rule_vote.bump = bump;

    rule_proposal.vote_count = rule_proposal
        .vote_count
        .checked_add(1)
        .ok_or(TycheError::ArithmeticOverflow)?;
    if let Some(index) = finalist_index {
        turn_state.finalist_approval_vote_counts[index] = turn_state
            .finalist_approval_vote_counts[index]
            .checked_add(1)
            .ok_or(TycheError::ArithmeticOverflow)?;
    }
    game_token.used_for_vote_count = game_token
        .used_for_vote_count
        .checked_add(1)
        .ok_or(TycheError::ArithmeticOverflow)?;

    credit_fee_ledgers(turn_state, treasury_vault, prize_vault, fee)?;

    emit!(RuleVoteCast {
        turn_id,
        rule_id,
        voter,
        sequence,
        fee_lamports: fee.recorded_fee_lamports,
    });
    Ok(())
}

/// Writes an elimination vote and moves the ordinary elimination tally.
#[allow(clippy::too_many_arguments)]
fn apply_rule_elimination_vote(
    turn_state: &mut TurnState,
    treasury_vault: &mut TreasuryVault,
    prize_vault: &mut PrizeVault,
    rule_elimination_vote: &mut RuleEliminationVote,
    rule_id: u64,
    voter: Pubkey,
    sequence: u64,
    finalist_index: usize,
    fee: ActionFeeOutcome,
    now: i64,
    bump: u8,
) -> Result<()> {
    let turn_id = turn_state.turn_id;

    rule_elimination_vote.turn_id = turn_id;
    rule_elimination_vote.rule_id = rule_id;
    rule_elimination_vote.voter = voter;
    rule_elimination_vote.sequence = sequence;
    rule_elimination_vote.fee_lamports = fee.recorded_fee_lamports;
    rule_elimination_vote.created_at = now;
    rule_elimination_vote.bump = bump;

    turn_state.finalist_elimination_vote_counts[finalist_index] = turn_state
        .finalist_elimination_vote_counts[finalist_index]
        .checked_add(1)
        .ok_or(TycheError::ArithmeticOverflow)?;

    credit_fee_ledgers(turn_state, treasury_vault, prize_vault, fee)?;

    emit!(RuleEliminationVoteCast {
        turn_id,
        rule_id,
        voter,
        sequence,
        fee_lamports: fee.recorded_fee_lamports,
    });
    Ok(())
}

fn collect_fee<'info>(
    payer: &Signer<'info>,
    config: &GlobalConfig,
    treasury_vault: &Account<'info, TreasuryVault>,
    fee_pool: &Account<'info, tokenomics_core::DistributionVaultRecord>,
    prize_vault: &Account<'info, PrizeVault>,
    system_program: &Program<'info, System>,
    fee_lamports: u64,
) -> Result<()> {
    require_direct_fee_routing(config, treasury_vault)?;
    require_keys_eq!(
        fee_pool.key(),
        config.treasury_address,
        TycheError::InvalidFeePool
    );
    let (treasury_amount, prize_amount) = split_fee(fee_lamports, config.treasury_fee_bps)?;
    if treasury_amount > 0 {
        system_program::transfer(
            CpiContext::new(
                system_program.to_account_info(),
                Transfer {
                    from: payer.to_account_info(),
                    to: fee_pool.to_account_info(),
                },
            ),
            treasury_amount,
        )?;
    }
    if prize_amount > 0 {
        system_program::transfer(
            CpiContext::new(
                system_program.to_account_info(),
                Transfer {
                    from: payer.to_account_info(),
                    to: prize_vault.to_account_info(),
                },
            ),
            prize_amount,
        )?;
    }
    Ok(())
}

fn available_lamports(account: &AccountInfo) -> Result<u64> {
    account
        .lamports()
        .checked_sub(Rent::get()?.minimum_balance(account.data_len()))
        .ok_or(error!(TycheError::InsufficientVaultBalance))
}

/// Move lamports out of a program-owned vault PDA to a recipient by directly
/// mutating lamport balances. `system_program::transfer` cannot be used here
/// because the source is owned by this program, not the System Program. The
/// vault must retain at least its rent-exempt minimum.
fn pay_from_vault<'info>(
    vault: &AccountInfo<'info>,
    recipient: &AccountInfo<'info>,
    amount: u64,
) -> Result<()> {
    if amount == 0 {
        return Ok(());
    }
    let min_balance = Rent::get()?.minimum_balance(vault.data_len());
    let remaining = vault
        .lamports()
        .checked_sub(amount)
        .ok_or(TycheError::InsufficientVaultBalance)?;
    require!(
        remaining >= min_balance,
        TycheError::InsufficientVaultBalance
    );
    **vault.try_borrow_mut_lamports()? -= amount;
    **recipient.try_borrow_mut_lamports()? += amount;
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeGlobalConfigArgs {
    pub treasury_address: Pubkey,
    pub draw_vrf_config: Pubkey,
    pub election_vrf_config: Pubkey,
    pub guess_submission_fee_lamports: u64,
    pub rule_proposal_fee_lamports: u64,
    pub rule_removal_fee_lamports: u64,
    pub vote_fee_lamports: u64,
    pub treasury_fee_bps: u16,
    pub turn_duration_cycle: [u32; TURN_DURATION_CYCLE_LEN],
    pub rule_election_cutoff_bps: u16,
    pub guess_cutoff_bps: u16,
    pub max_rule_tokens: u16,
    pub top_voted_finalist_count: u8,
    pub random_finalist_count: u8,
    /// Deprecated/inactive. Retained for config layout compatibility; paid
    /// rule proposals are controlled by sequencing and escalating fees.
    pub max_rule_proposals_per_wallet_per_turn: u16,
    /// Deprecated/inactive. Retained for config layout compatibility; paid
    /// votes are controlled by sequencing and escalating fees.
    pub max_votes_per_wallet_per_turn: u16,
    pub minimum_claim_threshold_lamports: u64,
    pub claim_window_turns: u16,
    pub claim_window_days: u16,
    pub creator_reward_cap_lamports: u64,
    pub min_votes_creator_self_remove: u32,
    pub min_votes_third_party_remove: u32,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SetVrfConfigArgs {
    pub draw_vrf_config: Pubkey,
    pub election_vrf_config: Pubkey,
}

/// The §14 decisions, recorded in one governed write. Allowances and maximum
/// supply are absent on purpose: §3.1/§3.2 confirm them and they stay pinned to
/// their constants.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigureFounderPassArgs {
    /// FP-D2. `Unset` keeps the configuration unresolved and every asset
    /// refused.
    pub asset_standard: FounderPassAssetStandard,
    /// FP-D2. The asset programme that must own a candidate asset account.
    pub asset_program_id: Pubkey,
    /// FP-D2/FP-D5. Read from finalized on-chain collection creation (§4.3).
    pub canonical_collection: Pubkey,
    /// §7. The shared campaign the JDR boost draws from.
    pub campaign: Pubkey,
    /// FP-D2. How the 5,000 hard cap is proved (§4.3).
    pub supply_enforcement: FounderPassSupplyEnforcement,
    /// FP-D2. Immutable commitment over the finalized minted asset IDs.
    /// Required when `supply_enforcement` is `AllowlistCommitment`.
    pub allowlist_commitment: [u8; 32],
    /// FP-D6.
    pub ownership_snapshot_policy: FounderPassOwnershipSnapshotPolicy,
    /// FP-D7. Bitmask of boostable reward kinds; 0 means unresolved.
    pub boostable_reward_kinds: u32,
    /// FP-D8.
    pub fee_waiver_funding: FounderPassFeeWaiverFunding,
    /// FP-D9. Per-rule/per-turn pass vote concentration limit; 0 means
    /// unresolved.
    pub max_pass_vote_actions_per_rule_per_turn: u16,
    /// FP-D9. Multiple-pass wallet policy; 0 means unresolved.
    pub max_passes_per_wallet_per_turn: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SetFounderPassActivationArgs {
    pub enabled: bool,
    pub paused: bool,
    /// The activation boundary (§6.1): the first turn in which a benefit may
    /// be used. Required when enabling.
    pub activation_turn_id: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct MigrateFeePoolCustodyArgs {
    pub attributed_unbridged_lamports: u64,
    pub legacy_rollover_lamports: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SetTurnDurationCycleArgs {
    pub turn_duration_cycle: [u32; TURN_DURATION_CYCLE_LEN],
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProposeRuleArgs {
    pub rule_id: u64,
    pub sanitized_text: String,
    pub sanitized_text_hash: [u8; 32],
    pub normalized_text_hash: [u8; 32],
    pub official_interpretation_hash: [u8; 32],
    pub preflight_result_hash: [u8; 32],
    pub token_count: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PrecompileRuleArgs {
    pub compiled_artifact_hash: [u8; 32],
    pub passed: bool,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub enum VrfStage {
    FinalistElection,
    ActiveElection,
    Draw,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ResetStaleVrfRequestArgs {
    /// Which unsettled VRF request slot to clear so the pipeline re-requests.
    pub stage: VrfStage,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RecordClaimArgs {
    /// The turn the claim belongs to.
    pub turn_id: u64,
    /// The wallet entitled to pull the funds.
    pub claimant: Pubkey,
    /// Which payout this claim represents (winner / creator / voter).
    pub kind: ClaimKind,
    /// The off-chain-computed claimable amount, in lamports.
    pub amount_lamports: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ExpireClaimArgs {
    /// The turn the abandoned claim belongs to.
    pub turn_id: u64,
    /// The wallet that did not pull its payout in time.
    pub claimant: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SweepPrizeRolloverArgs {
    /// The closed turn whose leftover pool is being carried forward.
    pub source_turn_id: u64,
    /// The open turn that will pay the rolled-over pool out.
    pub destination_turn_id: u64,
    /// Share of the sweep attributed to the original-rule bucket.
    pub original_lamports: u64,
    /// Share of the sweep attributed to the alternative-rule bucket.
    pub alternative_lamports: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SettleActiveRuleTokenRewardsArgs {
    pub turn_id: u64,
    pub alternative_prize_pool_lamports: u64,
    pub winner_count: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RecordReferralRewardContributionArgs {
    pub turn_id: u64,
    pub contribution_id: [u8; 32],
    pub paid_atoms: u64,
}

#[derive(Accounts)]
#[instruction(args: InitializeGlobalConfigArgs)]
pub struct InitializeGlobalConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [b"global_config"],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,
    #[account(
        init,
        payer = authority,
        space = 8 + TreasuryVault::INIT_SPACE,
        seeds = [b"treasury_vault"],
        bump
    )]
    pub treasury_vault: Account<'info, TreasuryVault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetVrfConfig<'info> {
    pub governance_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"global_config"],
        bump = global_config.bump
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    /// CHECK: The handler requires the canonical ProgramData PDA for this
    /// program, validates the loader-v3 state tag, and matches its stored
    /// upgrade authority to `governance_authority`.
    #[account(owner = UPGRADEABLE_LOADER_ID)]
    pub program_data: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct InitializeFounderPassConfig<'info> {
    #[account(mut)]
    pub governance_authority: Signer<'info>,
    #[account(
        init,
        payer = governance_authority,
        space = 8 + FounderPassConfig::INIT_SPACE,
        seeds = [b"founder_pass_config"],
        bump
    )]
    pub founder_pass_config: Box<Account<'info, FounderPassConfig>>,
    /// CHECK: The handler requires the canonical ProgramData PDA for this
    /// program, validates the loader-v3 state tag, and matches its stored
    /// upgrade authority to `governance_authority`.
    #[account(owner = UPGRADEABLE_LOADER_ID)]
    pub program_data: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ConfigureFounderPass<'info> {
    pub governance_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"founder_pass_config"],
        bump = founder_pass_config.bump
    )]
    pub founder_pass_config: Box<Account<'info, FounderPassConfig>>,
    /// CHECK: Canonical loader-v3 ProgramData and upgrade authority are checked
    /// by the handler.
    #[account(owner = UPGRADEABLE_LOADER_ID)]
    pub program_data: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SetFounderPassActivation<'info> {
    pub governance_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"founder_pass_config"],
        bump = founder_pass_config.bump
    )]
    pub founder_pass_config: Box<Account<'info, FounderPassConfig>>,
    /// CHECK: Canonical loader-v3 ProgramData and upgrade authority are checked
    /// by the handler.
    #[account(owner = UPGRADEABLE_LOADER_ID)]
    pub program_data: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct InitializeFounderPassUsage<'info> {
    /// The asset's current on-chain owner, and the rent payer for the usage
    /// account (§6.2).
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [b"founder_pass_config"],
        bump = founder_pass_config.bump
    )]
    pub founder_pass_config: Box<Account<'info, FounderPassConfig>>,
    /// CHECK: Deliberately unchecked here and verified by
    /// `verify_founder_pass_asset`, which proves the account owner is the
    /// governed asset programme before interpreting a single byte, then checks
    /// the asset key, collection binding, current owner, and freeze state.
    /// Anchor cannot express that, and an `owner =` constraint on a config
    /// value is not available at declaration time.
    pub asset: UncheckedAccount<'info>,
    #[account(
        init,
        payer = owner,
        space = 8 + FounderPassUsage::INIT_SPACE,
        seeds = [b"founder_pass_usage".as_ref(), asset.key().as_ref()],
        bump
    )]
    pub founder_pass_usage: Box<Account<'info, FounderPassUsage>>,
    pub system_program: Program<'info, System>,
}

// ------------------------------------------------------------------
// FP2 account contexts (§6.3)
//
// Each pass-aware context is the ordinary context plus exactly four (or five,
// for a vote) Founder Pass accounts. The ordinary contexts are untouched, so
// existing clients and the deployed instruction layouts are unaffected.
// ------------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeFounderPassSponsorVault<'info> {
    #[account(mut)]
    pub governance_authority: Signer<'info>,
    #[account(
        init,
        payer = governance_authority,
        space = 8 + FounderPassSponsorVault::INIT_SPACE,
        seeds = [b"founder_pass_sponsor"],
        bump
    )]
    pub founder_pass_sponsor_vault: Box<Account<'info, FounderPassSponsorVault>>,
    /// CHECK: Canonical loader-v3 ProgramData and upgrade authority are checked
    /// by the handler.
    #[account(owner = UPGRADEABLE_LOADER_ID)]
    pub program_data: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundFounderPassSponsorVault<'info> {
    #[account(mut)]
    pub funder: Signer<'info>,
    #[account(
        mut,
        seeds = [b"founder_pass_sponsor"],
        bump = founder_pass_sponsor_vault.bump
    )]
    pub founder_pass_sponsor_vault: Box<Account<'info, FounderPassSponsorVault>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct WithdrawFounderPassSponsorVault<'info> {
    pub governance_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"founder_pass_sponsor"],
        bump = founder_pass_sponsor_vault.bump
    )]
    pub founder_pass_sponsor_vault: Box<Account<'info, FounderPassSponsorVault>>,
    /// CHECK: Recipient of unspent sponsor lamports, chosen by the governance
    /// authority that signs this instruction.
    #[account(mut)]
    pub recipient: UncheckedAccount<'info>,
    /// CHECK: Canonical loader-v3 ProgramData and upgrade authority are checked
    /// by the handler.
    #[account(owner = UPGRADEABLE_LOADER_ID)]
    pub program_data: UncheckedAccount<'info>,
}

#[derive(Accounts)]
#[instruction(args: SubmitGuessArgs)]
pub struct SubmitGuessWithFounderPass<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        init,
        payer = player,
        space = 8 + PlayerGuess::INIT_SPACE,
        seeds = [
            b"guess".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            player.key().as_ref(),
            args.sequence.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub player_guess: Account<'info, PlayerGuess>,
    #[account(
        init,
        payer = player,
        space = 8 + GameToken::INIT_SPACE,
        seeds = [
            b"game_token".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            player.key().as_ref()
        ],
        bump
    )]
    pub game_token: Account<'info, GameToken>,
    #[account(mut, seeds = [b"treasury_vault"], bump = treasury_vault.bump)]
    pub treasury_vault: Account<'info, TreasuryVault>,
    #[account(
        mut,
        address = global_config.treasury_address @ TycheError::InvalidFeePool,
        seeds = [b"distribution_vault"],
        bump = fee_pool.bump,
        seeds::program = tokenomics_core::ID
    )]
    pub fee_pool: Account<'info, tokenomics_core::DistributionVaultRecord>,
    #[account(
        mut,
        seeds = [b"prize_vault".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub prize_vault: Account<'info, PrizeVault>,
    #[account(seeds = [b"founder_pass_config"], bump = founder_pass_config.bump)]
    pub founder_pass_config: Box<Account<'info, FounderPassConfig>>,
    /// CHECK: Deliberately unchecked here and verified by
    /// `verify_founder_pass_asset`, which proves the account owner is the
    /// governed asset programme before interpreting a single byte.
    pub asset: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"founder_pass_usage".as_ref(), asset.key().as_ref()],
        bump = founder_pass_usage.bump
    )]
    pub founder_pass_usage: Box<Account<'info, FounderPassUsage>>,
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + FounderPassWalletTurn::INIT_SPACE,
        seeds = [
            b"fp_wallet_turn".as_ref(),
            player.key().as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub founder_pass_wallet_turn: Box<Account<'info, FounderPassWalletTurn>>,
    #[account(
        mut,
        seeds = [b"founder_pass_sponsor"],
        bump = founder_pass_sponsor_vault.bump
    )]
    pub founder_pass_sponsor_vault: Box<Account<'info, FounderPassSponsorVault>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: SubmitGuessArgs)]
pub struct SubmitAdditionalGuessWithFounderPass<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        init,
        payer = player,
        space = 8 + PlayerGuess::INIT_SPACE,
        seeds = [
            b"guess".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            player.key().as_ref(),
            args.sequence.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub player_guess: Account<'info, PlayerGuess>,
    #[account(
        mut,
        seeds = [
            b"game_token".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            player.key().as_ref()
        ],
        bump = game_token.bump,
        constraint = game_token.player == player.key() @ TycheError::InvalidGameToken,
        constraint = game_token.turn_id == turn_state.turn_id @ TycheError::InvalidGameToken
    )]
    pub game_token: Account<'info, GameToken>,
    #[account(mut, seeds = [b"treasury_vault"], bump = treasury_vault.bump)]
    pub treasury_vault: Account<'info, TreasuryVault>,
    #[account(
        mut,
        address = global_config.treasury_address @ TycheError::InvalidFeePool,
        seeds = [b"distribution_vault"],
        bump = fee_pool.bump,
        seeds::program = tokenomics_core::ID
    )]
    pub fee_pool: Account<'info, tokenomics_core::DistributionVaultRecord>,
    #[account(
        mut,
        seeds = [b"prize_vault".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub prize_vault: Account<'info, PrizeVault>,
    #[account(seeds = [b"founder_pass_config"], bump = founder_pass_config.bump)]
    pub founder_pass_config: Box<Account<'info, FounderPassConfig>>,
    /// CHECK: Verified by `verify_founder_pass_asset`.
    pub asset: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"founder_pass_usage".as_ref(), asset.key().as_ref()],
        bump = founder_pass_usage.bump
    )]
    pub founder_pass_usage: Box<Account<'info, FounderPassUsage>>,
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + FounderPassWalletTurn::INIT_SPACE,
        seeds = [
            b"fp_wallet_turn".as_ref(),
            player.key().as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub founder_pass_wallet_turn: Box<Account<'info, FounderPassWalletTurn>>,
    #[account(
        mut,
        seeds = [b"founder_pass_sponsor"],
        bump = founder_pass_sponsor_vault.bump
    )]
    pub founder_pass_sponsor_vault: Box<Account<'info, FounderPassSponsorVault>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: ProposeRuleArgs)]
pub struct ProposeRuleWithFounderPass<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        mut,
        seeds = [
            b"game_token".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            proposer.key().as_ref()
        ],
        bump = game_token.bump,
        constraint = game_token.player == proposer.key() @ TycheError::InvalidGameToken,
        constraint = game_token.turn_id == turn_state.turn_id @ TycheError::InvalidGameToken
    )]
    pub game_token: Account<'info, GameToken>,
    #[account(
        init,
        payer = proposer,
        space = 8 + RuleProposal::INIT_SPACE,
        seeds = [
            b"rule".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            args.rule_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub rule_proposal: Box<Account<'info, RuleProposal>>,
    #[account(mut, seeds = [b"treasury_vault"], bump = treasury_vault.bump)]
    pub treasury_vault: Account<'info, TreasuryVault>,
    #[account(
        mut,
        address = global_config.treasury_address @ TycheError::InvalidFeePool,
        seeds = [b"distribution_vault"],
        bump = fee_pool.bump,
        seeds::program = tokenomics_core::ID
    )]
    pub fee_pool: Account<'info, tokenomics_core::DistributionVaultRecord>,
    #[account(
        mut,
        seeds = [b"prize_vault".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub prize_vault: Account<'info, PrizeVault>,
    #[account(seeds = [b"founder_pass_config"], bump = founder_pass_config.bump)]
    pub founder_pass_config: Box<Account<'info, FounderPassConfig>>,
    /// CHECK: Verified by `verify_founder_pass_asset`.
    pub asset: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"founder_pass_usage".as_ref(), asset.key().as_ref()],
        bump = founder_pass_usage.bump
    )]
    pub founder_pass_usage: Box<Account<'info, FounderPassUsage>>,
    #[account(
        init_if_needed,
        payer = proposer,
        space = 8 + FounderPassWalletTurn::INIT_SPACE,
        seeds = [
            b"fp_wallet_turn".as_ref(),
            proposer.key().as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub founder_pass_wallet_turn: Box<Account<'info, FounderPassWalletTurn>>,
    #[account(
        mut,
        seeds = [b"founder_pass_sponsor"],
        bump = founder_pass_sponsor_vault.bump
    )]
    pub founder_pass_sponsor_vault: Box<Account<'info, FounderPassSponsorVault>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: VoteRuleArgs)]
pub struct VoteRuleWithFounderPass<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        mut,
        seeds = [
            b"game_token".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            voter.key().as_ref()
        ],
        bump = game_token.bump,
        constraint = game_token.player == voter.key() @ TycheError::InvalidGameToken,
        constraint = game_token.turn_id == turn_state.turn_id @ TycheError::InvalidGameToken
    )]
    pub game_token: Account<'info, GameToken>,
    #[account(
        mut,
        seeds = [
            b"rule".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref()
        ],
        bump = rule_proposal.bump,
        constraint = rule_proposal.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub rule_proposal: Box<Account<'info, RuleProposal>>,
    #[account(
        init,
        payer = voter,
        space = 8 + RuleVote::INIT_SPACE,
        seeds = [
            b"vote".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref(),
            voter.key().as_ref(),
            args.sequence.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub rule_vote: Account<'info, RuleVote>,
    #[account(mut, seeds = [b"treasury_vault"], bump = treasury_vault.bump)]
    pub treasury_vault: Account<'info, TreasuryVault>,
    #[account(
        mut,
        address = global_config.treasury_address @ TycheError::InvalidFeePool,
        seeds = [b"distribution_vault"],
        bump = fee_pool.bump,
        seeds::program = tokenomics_core::ID
    )]
    pub fee_pool: Account<'info, tokenomics_core::DistributionVaultRecord>,
    #[account(
        mut,
        seeds = [b"prize_vault".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = prize_vault.bump
    )]
    pub prize_vault: Account<'info, PrizeVault>,
    #[account(seeds = [b"founder_pass_config"], bump = founder_pass_config.bump)]
    pub founder_pass_config: Box<Account<'info, FounderPassConfig>>,
    /// CHECK: Verified by `verify_founder_pass_asset`.
    pub asset: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"founder_pass_usage".as_ref(), asset.key().as_ref()],
        bump = founder_pass_usage.bump
    )]
    pub founder_pass_usage: Box<Account<'info, FounderPassUsage>>,
    #[account(
        init_if_needed,
        payer = voter,
        space = 8 + FounderPassWalletTurn::INIT_SPACE,
        seeds = [
            b"fp_wallet_turn".as_ref(),
            voter.key().as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub founder_pass_wallet_turn: Box<Account<'info, FounderPassWalletTurn>>,
    #[account(
        init_if_needed,
        payer = voter,
        space = 8 + FounderPassVoteConcentration::INIT_SPACE,
        seeds = [
            b"fp_vote_conc".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref(),
            voter.key().as_ref()
        ],
        bump
    )]
    pub founder_pass_vote_concentration: Box<Account<'info, FounderPassVoteConcentration>>,
    #[account(
        mut,
        seeds = [b"founder_pass_sponsor"],
        bump = founder_pass_sponsor_vault.bump
    )]
    pub founder_pass_sponsor_vault: Box<Account<'info, FounderPassSponsorVault>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: EliminateVoteRuleArgs)]
pub struct EliminateVoteRuleWithFounderPass<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        seeds = [
            b"game_token".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            voter.key().as_ref()
        ],
        bump = game_token.bump,
        constraint = game_token.player == voter.key() @ TycheError::InvalidGameToken,
        constraint = game_token.turn_id == turn_state.turn_id @ TycheError::InvalidGameToken
    )]
    pub game_token: Account<'info, GameToken>,
    #[account(
        seeds = [
            b"rule".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref()
        ],
        bump = rule_proposal.bump,
        constraint = rule_proposal.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub rule_proposal: Box<Account<'info, RuleProposal>>,
    #[account(
        init,
        payer = voter,
        space = 8 + RuleEliminationVote::INIT_SPACE,
        seeds = [
            b"elimination_vote".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref(),
            voter.key().as_ref(),
            args.sequence.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub rule_elimination_vote: Account<'info, RuleEliminationVote>,
    #[account(mut, seeds = [b"treasury_vault"], bump = treasury_vault.bump)]
    pub treasury_vault: Account<'info, TreasuryVault>,
    #[account(
        mut,
        address = global_config.treasury_address @ TycheError::InvalidFeePool,
        seeds = [b"distribution_vault"],
        bump = fee_pool.bump,
        seeds::program = tokenomics_core::ID
    )]
    pub fee_pool: Account<'info, tokenomics_core::DistributionVaultRecord>,
    #[account(
        mut,
        seeds = [b"prize_vault".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub prize_vault: Account<'info, PrizeVault>,
    #[account(seeds = [b"founder_pass_config"], bump = founder_pass_config.bump)]
    pub founder_pass_config: Box<Account<'info, FounderPassConfig>>,
    /// CHECK: Verified by `verify_founder_pass_asset`.
    pub asset: UncheckedAccount<'info>,
    #[account(
        mut,
        seeds = [b"founder_pass_usage".as_ref(), asset.key().as_ref()],
        bump = founder_pass_usage.bump
    )]
    pub founder_pass_usage: Box<Account<'info, FounderPassUsage>>,
    #[account(
        init_if_needed,
        payer = voter,
        space = 8 + FounderPassWalletTurn::INIT_SPACE,
        seeds = [
            b"fp_wallet_turn".as_ref(),
            voter.key().as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub founder_pass_wallet_turn: Box<Account<'info, FounderPassWalletTurn>>,
    #[account(
        init_if_needed,
        payer = voter,
        space = 8 + FounderPassVoteConcentration::INIT_SPACE,
        seeds = [
            b"fp_vote_conc".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref(),
            voter.key().as_ref()
        ],
        bump
    )]
    pub founder_pass_vote_concentration: Box<Account<'info, FounderPassVoteConcentration>>,
    #[account(
        mut,
        seeds = [b"founder_pass_sponsor"],
        bump = founder_pass_sponsor_vault.bump
    )]
    pub founder_pass_sponsor_vault: Box<Account<'info, FounderPassSponsorVault>>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MigrateFeePoolCustody<'info> {
    pub governance_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"global_config"],
        bump = global_config.bump
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"treasury_vault"],
        bump = treasury_vault.bump
    )]
    pub treasury_vault: Account<'info, TreasuryVault>,
    /// CHECK: Canonical loader-v3 ProgramData and upgrade authority are checked
    /// in the handler before any state or lamports are changed.
    #[account(owner = UPGRADEABLE_LOADER_ID)]
    pub program_data: UncheckedAccount<'info>,
    pub tokenomics_program: Program<'info, tokenomics_core::program::TokenomicsCore>,
    #[account(
        mut,
        seeds = [b"token_config"],
        bump = token_config.bump,
        seeds::program = tokenomics_program.key()
    )]
    pub token_config: Account<'info, tokenomics_core::TokenConfig>,
    #[account(
        mut,
        address = token_config.distribution_vault @ TycheError::InvalidFeePool,
        seeds = [b"distribution_vault"],
        bump = distribution_vault.bump,
        seeds::program = tokenomics_program.key()
    )]
    pub distribution_vault: Account<'info, tokenomics_core::DistributionVaultRecord>,
}

#[derive(Accounts)]
#[instruction(turn_id: u64)]
pub struct OpenTurn<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        init,
        payer = authority,
        space = 8 + TurnState::INIT_SPACE,
        seeds = [b"turn".as_ref(), turn_id.to_le_bytes().as_ref()],
        bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        init,
        payer = authority,
        space = 8 + PrizeVault::INIT_SPACE,
        seeds = [b"prize_vault".as_ref(), turn_id.to_le_bytes().as_ref()],
        bump
    )]
    pub prize_vault: Account<'info, PrizeVault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetTurnDurationCycle<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct SubmitGuessArgs {
    pub numbers: [u8; 6],
    pub sequence: u64,
}

#[derive(Accounts)]
#[instruction(args: SubmitGuessArgs)]
pub struct SubmitGuess<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        init,
        payer = player,
        space = 8 + PlayerGuess::INIT_SPACE,
        seeds = [
            b"guess".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            player.key().as_ref(),
            args.sequence.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub player_guess: Account<'info, PlayerGuess>,
    #[account(
        init,
        payer = player,
        space = 8 + GameToken::INIT_SPACE,
        seeds = [
            b"game_token".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            player.key().as_ref()
        ],
        bump
    )]
    pub game_token: Account<'info, GameToken>,
    #[account(
        mut,
        seeds = [b"treasury_vault"],
        bump = treasury_vault.bump
    )]
    pub treasury_vault: Account<'info, TreasuryVault>,
    #[account(
        mut,
        address = global_config.treasury_address @ TycheError::InvalidFeePool,
        seeds = [b"distribution_vault"],
        bump = fee_pool.bump,
        seeds::program = tokenomics_core::ID
    )]
    pub fee_pool: Account<'info, tokenomics_core::DistributionVaultRecord>,
    #[account(
        mut,
        seeds = [
            b"prize_vault".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub prize_vault: Account<'info, PrizeVault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: SubmitGuessArgs)]
pub struct SubmitAdditionalGuess<'info> {
    #[account(mut)]
    pub player: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        init,
        payer = player,
        space = 8 + PlayerGuess::INIT_SPACE,
        seeds = [
            b"guess".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            player.key().as_ref(),
            args.sequence.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub player_guess: Account<'info, PlayerGuess>,
    #[account(
        mut,
        seeds = [
            b"game_token".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            player.key().as_ref()
        ],
        bump = game_token.bump,
        constraint = game_token.player == player.key() @ TycheError::InvalidGameToken,
        constraint = game_token.turn_id == turn_state.turn_id @ TycheError::InvalidGameToken
    )]
    pub game_token: Account<'info, GameToken>,
    #[account(
        mut,
        seeds = [b"treasury_vault"],
        bump = treasury_vault.bump
    )]
    pub treasury_vault: Account<'info, TreasuryVault>,
    #[account(
        mut,
        address = global_config.treasury_address @ TycheError::InvalidFeePool,
        seeds = [b"distribution_vault"],
        bump = fee_pool.bump,
        seeds::program = tokenomics_core::ID
    )]
    pub fee_pool: Account<'info, tokenomics_core::DistributionVaultRecord>,
    #[account(
        mut,
        seeds = [
            b"prize_vault".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub prize_vault: Account<'info, PrizeVault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: ProposeRuleArgs)]
pub struct ProposeRule<'info> {
    #[account(mut)]
    pub proposer: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        mut,
        seeds = [
            b"game_token".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            proposer.key().as_ref()
        ],
        bump = game_token.bump,
        constraint = game_token.player == proposer.key() @ TycheError::InvalidGameToken,
        constraint = game_token.turn_id == turn_state.turn_id @ TycheError::InvalidGameToken
    )]
    pub game_token: Account<'info, GameToken>,
    #[account(
        init,
        payer = proposer,
        space = 8 + RuleProposal::INIT_SPACE,
        seeds = [
            b"rule".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            args.rule_id.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub rule_proposal: Box<Account<'info, RuleProposal>>,
    #[account(mut, seeds = [b"treasury_vault"], bump = treasury_vault.bump)]
    pub treasury_vault: Account<'info, TreasuryVault>,
    #[account(
        mut,
        address = global_config.treasury_address @ TycheError::InvalidFeePool,
        seeds = [b"distribution_vault"],
        bump = fee_pool.bump,
        seeds::program = tokenomics_core::ID
    )]
    pub fee_pool: Account<'info, tokenomics_core::DistributionVaultRecord>,
    #[account(
        mut,
        seeds = [
            b"prize_vault".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub prize_vault: Account<'info, PrizeVault>,
    pub system_program: Program<'info, System>,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct VoteRuleArgs {
    pub sequence: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq, Eq)]
pub struct EliminateVoteRuleArgs {
    pub sequence: u64,
}

#[derive(Accounts)]
#[instruction(args: VoteRuleArgs)]
pub struct VoteRule<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        mut,
        seeds = [
            b"game_token".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            voter.key().as_ref()
        ],
        bump = game_token.bump,
        constraint = game_token.player == voter.key() @ TycheError::InvalidGameToken,
        constraint = game_token.turn_id == turn_state.turn_id @ TycheError::InvalidGameToken
    )]
    pub game_token: Account<'info, GameToken>,
    #[account(
        mut,
        seeds = [
            b"rule".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref()
        ],
        bump = rule_proposal.bump,
        constraint = rule_proposal.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub rule_proposal: Box<Account<'info, RuleProposal>>,
    #[account(
        init,
        payer = voter,
        space = 8 + RuleVote::INIT_SPACE,
        seeds = [
            b"vote".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref(),
            voter.key().as_ref(),
            args.sequence.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub rule_vote: Account<'info, RuleVote>,
    #[account(mut, seeds = [b"treasury_vault"], bump = treasury_vault.bump)]
    pub treasury_vault: Account<'info, TreasuryVault>,
    #[account(
        mut,
        address = global_config.treasury_address @ TycheError::InvalidFeePool,
        seeds = [b"distribution_vault"],
        bump = fee_pool.bump,
        seeds::program = tokenomics_core::ID
    )]
    pub fee_pool: Account<'info, tokenomics_core::DistributionVaultRecord>,
    #[account(
        mut,
        seeds = [b"prize_vault".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = prize_vault.bump
    )]
    pub prize_vault: Account<'info, PrizeVault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RemoveRule<'info> {
    #[account(mut)]
    pub remover: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        seeds = [
            b"game_token".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            remover.key().as_ref()
        ],
        bump = game_token.bump,
        constraint = game_token.player == remover.key() @ TycheError::InvalidGameToken,
        constraint = game_token.turn_id == turn_state.turn_id @ TycheError::InvalidGameToken
    )]
    pub game_token: Account<'info, GameToken>,
    #[account(
        mut,
        seeds = [
            b"rule".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref()
        ],
        bump = rule_proposal.bump,
        constraint = rule_proposal.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub rule_proposal: Box<Account<'info, RuleProposal>>,
    #[account(
        init,
        payer = remover,
        space = 8 + RuleRemoval::INIT_SPACE,
        seeds = [
            b"rule_removal".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref(),
            remover.key().as_ref()
        ],
        bump
    )]
    pub rule_removal: Account<'info, RuleRemoval>,
    #[account(mut, seeds = [b"treasury_vault"], bump = treasury_vault.bump)]
    pub treasury_vault: Account<'info, TreasuryVault>,
    #[account(
        mut,
        address = global_config.treasury_address @ TycheError::InvalidFeePool,
        seeds = [b"distribution_vault"],
        bump = fee_pool.bump,
        seeds::program = tokenomics_core::ID
    )]
    pub fee_pool: Account<'info, tokenomics_core::DistributionVaultRecord>,
    #[account(
        mut,
        seeds = [
            b"prize_vault".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub prize_vault: Account<'info, PrizeVault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: EliminateVoteRuleArgs)]
pub struct EliminateVoteRule<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        seeds = [
            b"game_token".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            voter.key().as_ref()
        ],
        bump = game_token.bump,
        constraint = game_token.player == voter.key() @ TycheError::InvalidGameToken,
        constraint = game_token.turn_id == turn_state.turn_id @ TycheError::InvalidGameToken
    )]
    pub game_token: Account<'info, GameToken>,
    #[account(
        seeds = [
            b"rule".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref()
        ],
        bump = rule_proposal.bump,
        constraint = rule_proposal.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub rule_proposal: Box<Account<'info, RuleProposal>>,
    #[account(
        init,
        payer = voter,
        space = 8 + RuleEliminationVote::INIT_SPACE,
        seeds = [
            b"elimination_vote".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref(),
            voter.key().as_ref(),
            args.sequence.to_le_bytes().as_ref()
        ],
        bump
    )]
    pub rule_elimination_vote: Account<'info, RuleEliminationVote>,
    #[account(mut, seeds = [b"treasury_vault"], bump = treasury_vault.bump)]
    pub treasury_vault: Account<'info, TreasuryVault>,
    #[account(
        mut,
        address = global_config.treasury_address @ TycheError::InvalidFeePool,
        seeds = [b"distribution_vault"],
        bump = fee_pool.bump,
        seeds::program = tokenomics_core::ID
    )]
    pub fee_pool: Account<'info, tokenomics_core::DistributionVaultRecord>,
    #[account(
        mut,
        seeds = [
            b"prize_vault".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub prize_vault: Account<'info, PrizeVault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PrecompileRule<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        mut,
        seeds = [
            b"rule".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref()
        ],
        bump = rule_proposal.bump,
        constraint = rule_proposal.turn_id == turn_state.turn_id @ TycheError::InvalidTurnId
    )]
    pub rule_proposal: Box<Account<'info, RuleProposal>>,
}

#[derive(Accounts)]
pub struct LockRuleElectionPool<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
}

#[derive(Accounts)]
pub struct RequestRuleElectionVrf<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    /// CHECK: Switchboard On-Demand randomness account, verified in the handler
    /// (owner is the Switchboard program and queue matches the configured
    /// election VRF queue).
    pub randomness: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SettleRuleElection<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    /// CHECK: Switchboard On-Demand randomness account, verified in the handler
    /// (bound to the account recorded at request, owner is the Switchboard
    /// program, queue matches the configured election VRF queue, seed_slot
    /// matches the recorded commit slot, value freshly revealed this slot).
    pub randomness: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CloseEliminationWindow<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
}

#[derive(Accounts)]
pub struct RequestActiveElectionVrf<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    /// CHECK: Switchboard On-Demand randomness account, verified in the handler
    /// (owner is the Switchboard program and queue matches the configured
    /// election VRF queue).
    pub randomness: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ResetStaleVrfRequest<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    /// CHECK: the randomness account recorded on the turn for the reset stage;
    /// the handler requires its key to match the recorded request and the
    /// account to be non-existent (zero lamports, empty data) before clearing.
    pub randomness: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SettleActiveElection<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    /// CHECK: Switchboard On-Demand randomness account, verified in the handler
    /// (bound to the account recorded at request, owner is the Switchboard
    /// program, queue matches the configured election VRF queue, seed_slot
    /// matches the recorded commit slot, value freshly revealed this slot).
    pub randomness: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct CloseTurn<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
}

#[derive(Accounts)]
pub struct BridgeTurnTreasuryFee<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        mut,
        seeds = [b"treasury_vault"],
        bump = treasury_vault.bump
    )]
    pub treasury_vault: Account<'info, TreasuryVault>,
    pub tokenomics_program: Program<'info, tokenomics_core::program::TokenomicsCore>,
    #[account(
        seeds = [b"token_config"],
        bump = token_config.bump,
        seeds::program = tokenomics_program.key()
    )]
    pub token_config: Account<'info, tokenomics_core::TokenConfig>,
    #[account(
        mut,
        seeds = [b"epoch", epoch.epoch_id.to_le_bytes().as_ref()],
        bump = epoch.bump,
        seeds::program = tokenomics_program.key()
    )]
    pub epoch: Account<'info, tokenomics_core::DistributionEpoch>,
    #[account(
        mut,
        address = token_config.distribution_vault,
        seeds = [b"distribution_vault"],
        bump = distribution_vault.bump,
        seeds::program = tokenomics_program.key()
    )]
    pub distribution_vault: Account<'info, tokenomics_core::DistributionVaultRecord>,
}

#[derive(Accounts)]
pub struct CloseTokenomicsEpochCollection<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    pub tokenomics_program: Program<'info, tokenomics_core::program::TokenomicsCore>,
    #[account(
        seeds = [b"token_config"],
        bump = token_config.bump,
        seeds::program = tokenomics_program.key(),
        constraint = token_config.game_authority == global_config.key()
            @ TycheError::InvalidTokenomicsConfiguration
    )]
    pub token_config: Account<'info, tokenomics_core::TokenConfig>,
    #[account(
        mut,
        seeds = [b"epoch", epoch.epoch_id.to_le_bytes().as_ref()],
        bump = epoch.bump,
        seeds::program = tokenomics_program.key()
    )]
    pub epoch: Account<'info, tokenomics_core::DistributionEpoch>,
}

#[derive(Accounts)]
pub struct SettleProposalTokenReward<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        seeds = [
            b"rule",
            rule_proposal.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref()
        ],
        bump = rule_proposal.bump
    )]
    pub rule_proposal: Box<Account<'info, RuleProposal>>,
    pub tokenomics_program: Program<'info, tokenomics_core::program::TokenomicsCore>,
    #[account(
        seeds = [b"token_config"],
        bump = token_config.bump,
        seeds::program = tokenomics_program.key(),
        constraint = token_config.game_authority == global_config.key()
            @ TycheError::InvalidTokenomicsConfiguration
    )]
    pub token_config: Box<Account<'info, tokenomics_core::TokenConfig>>,
    #[account(address = token_config.mint)]
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.to_le_bytes().as_ref()],
        bump = campaign.bump,
        seeds::program = tokenomics_program.key()
    )]
    pub campaign: Box<Account<'info, tokenomics_core::CampaignReserve>>,
    #[account(mut, address = campaign.vault)]
    pub campaign_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = beneficiary_token_account.owner == rule_proposal.proposer
            @ TycheError::InvalidRewardBeneficiary,
        constraint = beneficiary_token_account.mint == token_config.mint
            @ TycheError::InvalidTokenomicsConfiguration
    )]
    pub beneficiary_token_account: Account<'info, TokenAccount>,
    /// CHECK: Tokenomics Core verifies the canonical reward-receipt PDA and
    /// initializes it atomically; this program binds the action and recipient.
    #[account(mut)]
    pub reward_receipt: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleSupporterTokenReward<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        seeds = [
            b"vote",
            rule_vote.turn_id.to_le_bytes().as_ref(),
            rule_vote.rule_id.to_le_bytes().as_ref(),
            rule_vote.voter.as_ref(),
            rule_vote.sequence.to_le_bytes().as_ref()
        ],
        bump = rule_vote.bump
    )]
    pub rule_vote: Account<'info, RuleVote>,
    pub tokenomics_program: Program<'info, tokenomics_core::program::TokenomicsCore>,
    #[account(
        seeds = [b"token_config"],
        bump = token_config.bump,
        seeds::program = tokenomics_program.key(),
        constraint = token_config.game_authority == global_config.key()
            @ TycheError::InvalidTokenomicsConfiguration
    )]
    pub token_config: Account<'info, tokenomics_core::TokenConfig>,
    #[account(address = token_config.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.to_le_bytes().as_ref()],
        bump = campaign.bump,
        seeds::program = tokenomics_program.key()
    )]
    pub campaign: Account<'info, tokenomics_core::CampaignReserve>,
    #[account(mut, address = campaign.vault)]
    pub campaign_vault: Account<'info, TokenAccount>,
    #[account(
        mut,
        constraint = beneficiary_token_account.owner == rule_vote.voter
            @ TycheError::InvalidRewardBeneficiary,
        constraint = beneficiary_token_account.mint == token_config.mint
            @ TycheError::InvalidTokenomicsConfiguration
    )]
    pub beneficiary_token_account: Account<'info, TokenAccount>,
    /// CHECK: Tokenomics Core verifies the canonical reward-receipt PDA and
    /// initializes it atomically; this program binds the action and recipient.
    #[account(mut)]
    pub reward_receipt: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(args: SettleActiveRuleTokenRewardsArgs)]
pub struct SettleActiveRuleTokenRewards<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        seeds = [b"turn", args.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        seeds = [
            b"rule",
            args.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref()
        ],
        bump = rule_proposal.bump,
        constraint = rule_proposal.turn_id == args.turn_id @ TycheError::InvalidTurnId
    )]
    pub rule_proposal: Box<Account<'info, RuleProposal>>,
    pub tokenomics_program: Program<'info, tokenomics_core::program::TokenomicsCore>,
    #[account(
        seeds = [b"token_config"],
        bump = token_config.bump,
        seeds::program = tokenomics_program.key(),
        constraint = token_config.game_authority == global_config.key()
            @ TycheError::InvalidTokenomicsConfiguration
    )]
    pub token_config: Box<Account<'info, tokenomics_core::TokenConfig>>,
    #[account(address = token_config.mint)]
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.to_le_bytes().as_ref()],
        bump = campaign.bump,
        seeds::program = tokenomics_program.key()
    )]
    pub campaign: Box<Account<'info, tokenomics_core::CampaignReserve>>,
    #[account(mut, address = campaign.vault)]
    pub campaign_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = creator_token_account.owner == rule_proposal.proposer
            @ TycheError::InvalidRewardBeneficiary,
        constraint = creator_token_account.mint == token_config.mint
            @ TycheError::InvalidTokenomicsConfiguration
    )]
    pub creator_token_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: Tokenomics Core verifies and initializes the turn/campaign PDA.
    #[account(mut)]
    pub active_rule_reward: UncheckedAccount<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(turn_id: u64)]
pub struct SettleReferralBaseTokenRewards<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        seeds = [
            b"game_token",
            turn_id.to_le_bytes().as_ref(),
            attribution.invitee.as_ref()
        ],
        bump = game_token.bump
    )]
    pub game_token: Box<Account<'info, GameToken>>,
    pub tokenomics_program: Program<'info, tokenomics_core::program::TokenomicsCore>,
    #[account(
        seeds = [b"token_config"],
        bump = token_config.bump,
        seeds::program = tokenomics_program.key(),
        constraint = token_config.game_authority == global_config.key()
            @ TycheError::InvalidTokenomicsConfiguration
    )]
    pub token_config: Box<Account<'info, tokenomics_core::TokenConfig>>,
    #[account(address = token_config.mint)]
    pub mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [b"referral_attribution", attribution.invitee.as_ref()],
        bump = attribution.bump,
        seeds::program = tokenomics_program.key()
    )]
    pub attribution: Box<Account<'info, tokenomics_core::ReferralAttribution>>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.to_le_bytes().as_ref()],
        bump = campaign.bump,
        seeds::program = tokenomics_program.key()
    )]
    pub campaign: Box<Account<'info, tokenomics_core::CampaignReserve>>,
    #[account(mut, address = campaign.vault)]
    pub campaign_vault: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub inviter_token_account: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = invitee_token_account.owner == attribution.invitee
            @ TycheError::InvalidRewardBeneficiary
    )]
    pub invitee_token_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(args: RecordReferralRewardContributionArgs)]
pub struct RecordReferralRewardContribution<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    pub tokenomics_program: Program<'info, tokenomics_core::program::TokenomicsCore>,
    #[account(
        seeds = [b"token_config"],
        bump = token_config.bump,
        seeds::program = tokenomics_program.key(),
        constraint = token_config.game_authority == global_config.key()
            @ TycheError::InvalidTokenomicsConfiguration
    )]
    pub token_config: Account<'info, tokenomics_core::TokenConfig>,
    #[account(
        mut,
        seeds = [b"referral_attribution", attribution.invitee.as_ref()],
        bump = attribution.bump,
        seeds::program = tokenomics_program.key()
    )]
    pub attribution: Account<'info, tokenomics_core::ReferralAttribution>,
    /// CHECK: Tokenomics Core validates and initializes the idempotency PDA.
    #[account(
        mut,
        seeds = [
            b"referral_contribution",
            attribution.key().as_ref(),
            args.contribution_id.as_ref()
        ],
        bump,
        seeds::program = tokenomics_program.key()
    )]
    pub contribution: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(turn_id: u64)]
pub struct SettleReferralBonusTokenReward<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    pub tokenomics_program: Program<'info, tokenomics_core::program::TokenomicsCore>,
    #[account(
        seeds = [b"token_config"],
        bump = token_config.bump,
        seeds::program = tokenomics_program.key(),
        constraint = token_config.game_authority == global_config.key()
            @ TycheError::InvalidTokenomicsConfiguration
    )]
    pub token_config: Account<'info, tokenomics_core::TokenConfig>,
    #[account(address = token_config.mint)]
    pub mint: Account<'info, Mint>,
    #[account(
        mut,
        seeds = [b"referral_attribution", attribution.invitee.as_ref()],
        bump = attribution.bump,
        seeds::program = tokenomics_program.key(),
        constraint = attribution.qualifying_turn_id == turn_id
            @ TycheError::InvalidTokenomicsRewardFact
    )]
    pub attribution: Account<'info, tokenomics_core::ReferralAttribution>,
    #[account(
        mut,
        seeds = [b"campaign", campaign.campaign_id.to_le_bytes().as_ref()],
        bump = campaign.bump,
        seeds::program = tokenomics_program.key()
    )]
    pub campaign: Account<'info, tokenomics_core::CampaignReserve>,
    #[account(mut, address = campaign.vault)]
    pub campaign_vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub inviter_token_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ForceSkipLegacyActiveTurn<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    /// CHECK: This may be a legacy TurnState account that the current program
    /// cannot deserialize. The handler manually verifies owner, PDA seeds, and
    /// undersized data length before mutating GlobalConfig.
    pub turn_state: UncheckedAccount<'info>,
}

#[cfg(feature = "devnet-test")]
#[derive(Accounts)]
pub struct ReinitializeGlobalConfigForMigration<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    /// CHECK: Loaded unchecked because the on-chain layout predates the current
    /// GlobalConfig and cannot be deserialized as the typed account. The handler
    /// validates the discriminator and the stable `authority` field; the
    /// canonical PDA is enforced by the seeds/bump constraint here (note: `bump`
    /// re-derives the canonical bump rather than trusting the stale stored one).
    #[account(mut, seeds = [b"global_config"], bump)]
    pub global_config: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RequestDraw<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    /// CHECK: Switchboard On-Demand randomness account, verified in the handler
    /// (owner is the Switchboard program and queue matches the configured draw
    /// VRF queue). Owned by the Switchboard program, not this program, so it
    /// cannot be a typed Anchor account.
    pub randomness: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct SettleDraw<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    /// CHECK: Switchboard On-Demand randomness account, verified in the handler
    /// (bound to the account recorded at request, owner is the Switchboard
    /// program, queue matches the configured draw VRF queue, seed_slot matches
    /// the recorded commit slot, value freshly revealed this slot).
    pub randomness: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct FailDraw<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), turn_state.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
}

#[derive(Accounts)]
#[instruction(args: ExpireClaimArgs)]
pub struct ExpireClaim<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [
            b"claim".as_ref(),
            args.turn_id.to_le_bytes().as_ref(),
            args.claimant.as_ref(),
            &[ClaimKind::WinnerPayout as u8],
        ],
        bump = claim.bump,
        constraint = claim.turn_id == args.turn_id @ TycheError::InvalidTurnId,
        constraint = claim.claimant == args.claimant @ TycheError::InvalidClaimant
    )]
    pub claim: Box<Account<'info, Claim>>,
    #[account(
        mut,
        seeds = [b"prize_vault".as_ref(), args.turn_id.to_le_bytes().as_ref()],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == args.turn_id @ TycheError::InvalidTurnId
    )]
    pub prize_vault: Account<'info, PrizeVault>,
}

#[derive(Accounts)]
#[instruction(args: SweepPrizeRolloverArgs)]
pub struct SweepPrizeRollover<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        seeds = [b"turn".as_ref(), args.source_turn_id.to_le_bytes().as_ref()],
        bump = source_turn_state.bump,
        constraint = source_turn_state.turn_id == args.source_turn_id @ TycheError::InvalidTurnId
    )]
    pub source_turn_state: Box<Account<'info, TurnState>>,
    #[account(
        mut,
        seeds = [b"prize_vault".as_ref(), args.source_turn_id.to_le_bytes().as_ref()],
        bump = source_prize_vault.bump,
        constraint = source_prize_vault.turn_id == args.source_turn_id @ TycheError::InvalidTurnId
    )]
    pub source_prize_vault: Account<'info, PrizeVault>,
    #[account(
        mut,
        seeds = [b"turn".as_ref(), args.destination_turn_id.to_le_bytes().as_ref()],
        bump = destination_turn_state.bump,
        constraint = destination_turn_state.turn_id == args.destination_turn_id @ TycheError::InvalidTurnId
    )]
    pub destination_turn_state: Box<Account<'info, TurnState>>,
    #[account(
        mut,
        seeds = [b"prize_vault".as_ref(), args.destination_turn_id.to_le_bytes().as_ref()],
        bump = destination_prize_vault.bump,
        constraint = destination_prize_vault.turn_id == args.destination_turn_id @ TycheError::InvalidTurnId
    )]
    pub destination_prize_vault: Account<'info, PrizeVault>,
}

#[derive(Accounts)]
#[instruction(args: RecordClaimArgs)]
pub struct RecordClaim<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ TycheError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        seeds = [b"turn".as_ref(), args.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump,
        constraint = turn_state.turn_id == args.turn_id @ TycheError::InvalidTurnId
    )]
    pub turn_state: Box<Account<'info, TurnState>>,
    #[account(
        init,
        payer = authority,
        space = 8 + Claim::INIT_SPACE,
        seeds = [
            b"claim".as_ref(),
            args.turn_id.to_le_bytes().as_ref(),
            args.claimant.as_ref(),
            &[args.kind as u8],
        ],
        bump
    )]
    pub claim: Box<Account<'info, Claim>>,
    #[account(
        mut,
        seeds = [b"prize_vault".as_ref(), args.turn_id.to_le_bytes().as_ref()],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == args.turn_id @ TycheError::InvalidTurnId
    )]
    pub prize_vault: Account<'info, PrizeVault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(turn_id: u64)]
pub struct ClaimPrize<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [
            b"claim".as_ref(),
            turn_id.to_le_bytes().as_ref(),
            claimant.key().as_ref(),
            &[ClaimKind::WinnerPayout as u8],
        ],
        bump = claim.bump,
        constraint = claim.claimant == claimant.key() @ TycheError::Unauthorized,
        constraint = claim.turn_id == turn_id @ TycheError::InvalidTurnId
    )]
    pub claim: Box<Account<'info, Claim>>,
    #[account(
        mut,
        seeds = [b"prize_vault".as_ref(), turn_id.to_le_bytes().as_ref()],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_id @ TycheError::InvalidTurnId
    )]
    pub prize_vault: Account<'info, PrizeVault>,
}

#[derive(Accounts)]
#[instruction(turn_id: u64, kind: ClaimKind)]
pub struct ClaimReward<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        mut,
        seeds = [
            b"claim".as_ref(),
            turn_id.to_le_bytes().as_ref(),
            claimant.key().as_ref(),
            &[kind as u8],
        ],
        bump = claim.bump,
        constraint = claim.claimant == claimant.key() @ TycheError::Unauthorized,
        constraint = claim.turn_id == turn_id @ TycheError::InvalidTurnId
    )]
    pub claim: Box<Account<'info, Claim>>,
    #[account(
        mut,
        seeds = [b"treasury_vault"],
        bump = treasury_vault.bump
    )]
    pub treasury_vault: Account<'info, TreasuryVault>,
}

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub authority: Pubkey,
    pub pending_authority: Option<Pubkey>,
    pub treasury_address: Pubkey,
    pub draw_vrf_config: Pubkey,
    pub election_vrf_config: Pubkey,
    pub guess_submission_fee_lamports: u64,
    pub rule_proposal_fee_lamports: u64,
    pub rule_removal_fee_lamports: u64,
    pub vote_fee_lamports: u64,
    pub treasury_fee_bps: u16,
    pub turn_duration_cycle: [u32; TURN_DURATION_CYCLE_LEN],
    pub active_turn_duration_index: u8,
    pub rule_election_cutoff_bps: u16,
    pub guess_cutoff_bps: u16,
    pub max_rule_tokens: u16,
    pub top_voted_finalist_count: u8,
    pub random_finalist_count: u8,
    /// Deprecated/inactive. Retained for config layout compatibility; paid
    /// rule proposals are controlled by sequencing and escalating fees.
    pub max_rule_proposals_per_wallet_per_turn: u16,
    /// Deprecated/inactive. Retained for config layout compatibility; paid
    /// votes are controlled by sequencing and escalating fees.
    pub max_votes_per_wallet_per_turn: u16,
    pub minimum_claim_threshold_lamports: u64,
    pub claim_window_turns: u16,
    pub claim_window_days: u16,
    pub creator_reward_cap_lamports: u64,
    pub min_votes_creator_self_remove: u32,
    pub min_votes_third_party_remove: u32,
    pub next_turn_id: u64,
    pub active_turn_id: u64,
    pub has_active_turn: bool,
    pub paused: bool,
    pub bump: u8,
}

/// Governed Founder Pass configuration (§6.1).
///
/// New account in FP1: it reinterprets no existing bytes. Every §14 decision
/// is born unresolved and `enabled` is born false, so the deployed programme
/// authorizes no benefit until governance resolves each decision and activates
/// explicitly.
#[account]
#[derive(InitSpace)]
pub struct FounderPassConfig {
    pub version: u16,
    /// Benefits are live. Gated on `unresolved_decisions() == 0`.
    pub enabled: bool,
    /// Emergency pause. Suspends new benefits without rewriting historical
    /// usage or a settled claim (§6.1).
    pub paused: bool,
    pub asset_standard: FounderPassAssetStandard,
    pub asset_program_id: Pubkey,
    pub canonical_collection: Pubkey,
    pub campaign: Pubkey,
    /// Pinned to `FOUNDER_PASS_MAX_SUPPLY` (§3.1).
    pub max_supply: u32,
    pub supply_enforcement: FounderPassSupplyEnforcement,
    pub allowlist_commitment: [u8; 32],
    /// Stored so the active allowances are auditable on-chain. Pinned to the
    /// §3.2 constants by `validate_founder_pass_allowances`.
    pub vote_allowance: u32,
    pub rule_proposal_allowance: u32,
    pub bet_allowance: u32,
    /// Length in consecutive turns of the active-turn window a pass opens on
    /// its first use. Pinned to `FOUNDER_PASS_ACTIVE_TURN_WINDOW`.
    pub active_turn_window: u32,
    /// Anchors the one active-turn window every pass shares. Write-once: it
    /// cannot be changed after the first activation, so re-enabling can never
    /// shift the window under existing holders.
    pub activation_turn_id: u64,
    pub ownership_snapshot_policy: FounderPassOwnershipSnapshotPolicy,
    pub boostable_reward_kinds: u32,
    pub fee_waiver_funding: FounderPassFeeWaiverFunding,
    pub max_pass_vote_actions_per_rule_per_turn: u16,
    pub max_passes_per_wallet_per_turn: u8,
    pub bump: u8,
}

impl FounderPassConfig {
    pub fn policy(&self) -> FounderPassPolicy {
        FounderPassPolicy {
            asset_standard: self.asset_standard,
            asset_program_id: self.asset_program_id,
            canonical_collection: self.canonical_collection,
            campaign: self.campaign,
            max_supply: self.max_supply,
            supply_enforcement: self.supply_enforcement,
            allowlist_commitment: self.allowlist_commitment,
            ownership_snapshot_policy: self.ownership_snapshot_policy,
            boostable_reward_kinds: self.boostable_reward_kinds,
            fee_waiver_funding: self.fee_waiver_funding,
            max_pass_vote_actions_per_rule_per_turn: self.max_pass_vote_actions_per_rule_per_turn,
            max_passes_per_wallet_per_turn: self.max_passes_per_wallet_per_turn,
        }
    }

    /// Bitmask of §14 decisions still unresolved. Must be zero to activate.
    pub fn unresolved_decisions(&self) -> u16 {
        founder_pass_unresolved_decisions(&self.policy())
    }

    /// The one active-turn window every pass shares. Errors while benefits
    /// have never been activated, so no window exists to be inside.
    pub fn turn_window(&self) -> Result<FounderPassTurnWindow> {
        founder_pass_turn_window(self.activation_turn_id)
    }
}

/// Per-asset Founder Pass usage (§6.2).
///
/// Seeded by the individual NFT asset address, so quotas belong to the NFT and
/// do not reset when it moves (§3.2).
///
/// The shared turn budget is global — one window anchored at
/// `FounderPassConfig::activation_turn_id` — so this account holds no turn
/// state at all, only the action counters. §6.2 asked for membership-safe
/// storage because "a counter alone cannot prove whether a previously used turn
/// is being reused"; a governed contiguous range satisfies that more strongly
/// than a per-pass set, since eligibility is a comparison against bounds no
/// player can influence.
#[account]
#[derive(InitSpace)]
pub struct FounderPassUsage {
    pub version: u16,
    pub asset: Pubkey,
    pub collection: Pubkey,
    pub vote_actions_used: u32,
    pub rule_proposals_used: u32,
    pub bets_used: u32,
    pub bump: u8,
}

impl FounderPassUsage {
    pub fn view(&self) -> FounderPassUsageView {
        FounderPassUsageView {
            vote_actions_used: self.vote_actions_used,
            rule_proposals_used: self.rule_proposals_used,
            bets_used: self.bets_used,
        }
    }
}

/// Sponsor funding for waived Tyche fees (§8, FP-D8).
///
/// Only meaningful under `FounderPassFeeWaiverFunding::SponsorFunded`, where §8
/// requires the otherwise-due amount to reach the ordinary accounting path so a
/// waived fee is never booked as collected SOL that nobody paid. The vault's
/// own spendable balance is the "explicit funded limit" §8 demands: when it
/// cannot cover a waiver the action is refused, never silently under-collected
/// and never quietly charged back to the player.
///
/// The totals are cumulative and exist for reconciliation; the authoritative
/// spendable amount is always the account's live lamport balance above rent.
#[account]
#[derive(InitSpace)]
pub struct FounderPassSponsorVault {
    pub version: u16,
    pub total_funded_lamports: u64,
    pub total_spent_lamports: u64,
    pub bump: u8,
}

/// The distinct Founder Passes one wallet has spent in one turn (§10, FP-D9).
///
/// This stores the asset keys themselves rather than a count because a counter
/// cannot tell a repeat use of the same pass from the admission of a new one,
/// and the policy is about **distinct** passes. `FOUNDER_PASS_WALLET_TURN_PASS_SLOTS`
/// bounds the layout; governance chooses the actual limit within it.
#[account]
#[derive(InitSpace)]
pub struct FounderPassWalletTurn {
    pub version: u16,
    pub wallet: Pubkey,
    pub turn_id: u64,
    #[max_len(FOUNDER_PASS_WALLET_TURN_PASS_SLOTS)]
    pub assets: Vec<Pubkey>,
    pub bump: u8,
}

/// Pass-funded vote actions one wallet aimed at one rule in one turn (§10).
///
/// §10 requires a concentration policy to be enforced "before 1,000 fee-free
/// vote actions can affect finalist or elimination outcomes". Approval and
/// elimination counts are separate because they move different tallies.
#[account]
#[derive(InitSpace)]
pub struct FounderPassVoteConcentration {
    pub version: u16,
    pub turn_id: u64,
    pub rule_id: u64,
    pub wallet: Pubkey,
    pub approval_vote_actions: u16,
    pub elimination_vote_actions: u16,
    pub bump: u8,
}

impl FounderPassVoteConcentration {
    pub fn view(&self) -> FounderPassVoteConcentrationView {
        FounderPassVoteConcentrationView {
            approval_vote_actions: self.approval_vote_actions,
            elimination_vote_actions: self.elimination_vote_actions,
        }
    }
}

// ------------------------------------------------------------------
// FP2 gate: authorize, then commit (§3.3, §6.2, §8, §10)
// ------------------------------------------------------------------

/// Adopts or re-validates a per-wallet/per-turn record created on demand.
///
/// These records are `init_if_needed`, so a freshly created one arrives fully
/// zeroed. `version == 0` is therefore an unambiguous "just created" signal —
/// `FOUNDER_PASS_ACCOUNT_VERSION` is never zero. An existing record must match
/// the identity its seeds claim, which closes the re-initialization hole that
/// `init_if_needed` otherwise opens.
fn bind_founder_pass_wallet_turn(
    record: &mut FounderPassWalletTurn,
    wallet: Pubkey,
    turn_id: u64,
    bump: u8,
) -> Result<()> {
    if record.version == 0 {
        record.version = FOUNDER_PASS_ACCOUNT_VERSION;
        record.wallet = wallet;
        record.turn_id = turn_id;
        record.assets = Vec::new();
        record.bump = bump;
        return Ok(());
    }
    require!(
        record.version == FOUNDER_PASS_ACCOUNT_VERSION
            && record.wallet == wallet
            && record.turn_id == turn_id,
        TycheError::InvalidFounderPassWalletTurn
    );
    Ok(())
}

/// The vote-concentration counterpart of `bind_founder_pass_wallet_turn`.
fn bind_founder_pass_vote_concentration(
    record: &mut FounderPassVoteConcentration,
    wallet: Pubkey,
    turn_id: u64,
    rule_id: u64,
    bump: u8,
) -> Result<()> {
    if record.version == 0 {
        record.version = FOUNDER_PASS_ACCOUNT_VERSION;
        record.wallet = wallet;
        record.turn_id = turn_id;
        record.rule_id = rule_id;
        record.approval_vote_actions = 0;
        record.elimination_vote_actions = 0;
        record.bump = bump;
        return Ok(());
    }
    require!(
        record.version == FOUNDER_PASS_ACCOUNT_VERSION
            && record.wallet == wallet
            && record.turn_id == turn_id
            && record.rule_id == rule_id,
        TycheError::InvalidFounderPassVoteConcentration
    );
    Ok(())
}

/// Everything one pass-funded action needs decided before anything is written.
///
/// §5.2 requires a failed transaction to leave all counters unchanged, so every
/// post-state value is computed here and only written by
/// `commit_founder_pass_action` once all of them succeeded.
struct FounderPassActionPlan {
    asset: Pubkey,
    owner: Pubkey,
    usage: FounderPassUsageView,
    wallet_turn_assets: Vec<Pubkey>,
    settlement: FounderPassWaiverSettlement,
}

/// Authorizes one pass-funded action without writing anything.
///
/// This is the whole of §6.2's verification duty for FP2: benefits must be
/// active, every §14 decision resolved, the asset genuinely owned by the signer
/// and bound to the canonical collection, the turn inside the governed window,
/// the §3.2 quota intact, the §10 per-wallet pass limit respected, and the §8
/// funding policy able to cover the waiver.
#[allow(clippy::too_many_arguments)]
fn plan_founder_pass_action(
    config: &FounderPassConfig,
    usage: &FounderPassUsage,
    wallet_turn: &FounderPassWalletTurn,
    sponsor_vault: &AccountInfo<'_>,
    asset: &AccountInfo<'_>,
    owner: Pubkey,
    turn_id: u64,
    benefit: FounderPassBenefit,
    otherwise_due_lamports: u64,
    treasury_fee_bps: u16,
) -> Result<FounderPassActionPlan> {
    require!(
        config.enabled && !config.paused,
        TycheError::FounderPassInactive
    );
    require!(
        config.unresolved_decisions() == 0,
        TycheError::FounderPassDecisionsUnresolved
    );
    validate_founder_pass_allowances(
        config.vote_allowance,
        config.rule_proposal_allowance,
        config.bet_allowance,
        config.active_turn_window,
    )?;
    validate_founder_pass_concentration_policy(
        config.max_pass_vote_actions_per_rule_per_turn,
        config.max_passes_per_wallet_per_turn,
    )?;

    let window = config.turn_window()?;
    let facts = verify_founder_pass_asset(
        config.asset_standard,
        &config.asset_program_id,
        &config.canonical_collection,
        &owner,
        asset,
    )?;
    // The usage PDA is seeded by the asset, so Anchor already binds the two.
    // Checking the stored key as well means a usage account written under a
    // previous configuration cannot be reused against a different asset.
    require_keys_eq!(
        usage.asset,
        facts.asset,
        TycheError::FounderPassUsageMismatch
    );
    require_keys_eq!(
        usage.collection,
        config.canonical_collection,
        TycheError::FounderPassCollectionMismatch
    );

    let use_plan = plan_founder_pass_use(&usage.view(), window, benefit, turn_id)?;
    let wallet_plan = plan_founder_pass_wallet_turn(
        &wallet_turn.assets,
        facts.asset,
        config.max_passes_per_wallet_per_turn,
    )?;
    let settlement = plan_founder_pass_fee_waiver(
        config.fee_waiver_funding,
        otherwise_due_lamports,
        treasury_fee_bps,
        available_lamports(sponsor_vault)?,
    )?;

    Ok(FounderPassActionPlan {
        asset: facts.asset,
        owner: facts.owner,
        usage: FounderPassUsageView {
            vote_actions_used: use_plan.vote_actions_used,
            rule_proposals_used: use_plan.rule_proposals_used,
            bets_used: use_plan.bets_used,
        },
        wallet_turn_assets: wallet_plan.assets,
        settlement,
    })
}

/// Writes the authorized plan and moves the sponsor's SOL, if any.
///
/// Under `ReducedTurnPool` no lamport moves at all and the turn's treasury and
/// prize pool simply receive less, which is what §8 calls the disclosed cost of
/// the benefit. Under `SponsorFunded` the sponsor pays the identical split a
/// paying player would have paid, into the identical destinations, so the SOL
/// ledgers reconcile exactly as for a paid action.
/// Emits the §9 indexing record for one pass-funded action.
fn emit_founder_pass_benefit_used(
    plan: &FounderPassActionPlan,
    turn_id: u64,
    benefit: FounderPassBenefit,
    usage: &FounderPassUsage,
) {
    emit!(FounderPassBenefitUsed {
        asset: plan.asset,
        owner: plan.owner,
        turn_id,
        benefit,
        waived_fee_lamports: plan.settlement.waived_fee_lamports,
        sponsor_lamports: plan.settlement.sponsor_lamports,
        vote_actions_used: usage.vote_actions_used,
        rule_proposals_used: usage.rule_proposals_used,
        bets_used: usage.bets_used,
    });
}

fn commit_founder_pass_action<'info>(
    plan: &FounderPassActionPlan,
    usage: &mut FounderPassUsage,
    wallet_turn: &mut FounderPassWalletTurn,
    sponsor_vault: &AccountInfo<'info>,
    sponsor_record: &mut FounderPassSponsorVault,
    fee_pool: &AccountInfo<'info>,
    prize_vault: &AccountInfo<'info>,
) -> Result<()> {
    usage.vote_actions_used = plan.usage.vote_actions_used;
    usage.rule_proposals_used = plan.usage.rule_proposals_used;
    usage.bets_used = plan.usage.bets_used;
    wallet_turn.assets.clone_from(&plan.wallet_turn_assets);

    if plan.settlement.sponsor_lamports > 0 {
        pay_from_vault(sponsor_vault, fee_pool, plan.settlement.treasury_lamports)?;
        pay_from_vault(sponsor_vault, prize_vault, plan.settlement.prize_lamports)?;
        sponsor_record.total_spent_lamports = sponsor_record
            .total_spent_lamports
            .checked_add(plan.settlement.sponsor_lamports)
            .ok_or(TycheError::ArithmeticOverflow)?;
    }
    Ok(())
}

#[account]
#[derive(InitSpace)]
pub struct TurnState {
    pub turn_id: u64,
    pub start_timestamp: i64,
    pub end_timestamp: i64,
    pub status: TurnStatus,
    pub prize_pool_amount_lamports: u64,
    pub treasury_fee_amount_lamports: u64,
    pub treasury_fee_bridged: bool,
    pub turn_duration_seconds: u32,
    pub cycle_index: u8,
    pub draw_result: [u8; 6],
    pub active_rule_id: u64,
    pub active_rule_hash: [u8; 32],
    pub frozen_rule_artifact_hash: [u8; 32],
    pub eligible_rule_pool_hash: [u8; 32],
    pub top_voted_finalist_hash: [u8; 32],
    pub random_finalist_hash: [u8; 32],
    pub finalist_set_hash: [u8; 32],
    pub finalist_count: u8,
    pub finalist_rule_ids: [u64; MAX_FINALISTS],
    pub finalist_approval_vote_counts: [u32; MAX_FINALISTS],
    pub finalist_elimination_vote_counts: [u32; MAX_FINALISTS],
    pub finalist_eliminated: [bool; MAX_FINALISTS],
    pub eliminated_finalist_hash: [u8; 32],
    pub survivor_finalist_hash: [u8; 32],
    /// Close time of the elimination/decision window. The window spans the whole
    /// of phase 2, so this equals the turn `end_timestamp`; it is stamped when
    /// the finalist set is locked in `settle_rule_election`. Voting is open until
    /// this instant; the active-rule election + draw then run untimed.
    pub elimination_window_end_timestamp: i64,
    pub election_vrf_request: Pubkey,
    pub election_vrf_fulfillment: Pubkey,
    /// Switchboard `seed_slot` of the finalist-election randomness account,
    /// recorded at `request_rule_election_vrf` and re-checked at settle so a
    /// re-committed (re-rolled) account is rejected.
    pub election_commit_slot: u64,
    pub elected_finalist_index: u8,
    pub active_election_vrf_request: Pubkey,
    pub active_election_vrf_fulfillment: Pubkey,
    /// Switchboard `seed_slot` of the active-election randomness account.
    pub active_election_commit_slot: u64,
    pub elected_survivor_index: u8,
    pub draw_status: DrawStatus,
    pub draw_vrf_request: Pubkey,
    pub draw_vrf_fulfillment: Pubkey,
    /// Switchboard `seed_slot` of the draw randomness account.
    pub draw_commit_slot: u64,
    pub draw_randomness: [u8; 32],
    pub draw_requested_at: i64,
    pub drawn_at: i64,
    pub draw_failure_code: u8,
    pub original_pool_rollover_lamports: u64,
    pub alternative_pool_rollover_lamports: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct GameToken {
    pub turn_id: u64,
    pub player: Pubkey,
    pub issuing_guess: Pubkey,
    pub issued_at: i64,
    pub guess_count: u64,
    pub used_for_rule_proposal_count: u64,
    pub used_for_vote_count: u64,
    pub status: GameTokenStatus,
    pub close_authority: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PlayerGuess {
    pub turn_id: u64,
    pub player: Pubkey,
    pub sequence: u64,
    pub fee_lamports: u64,
    pub numbers: [u8; 6],
    pub submitted_at: i64,
    pub game_token: Pubkey,
    pub verification_status: VerificationStatus,
    pub original_rule_result: bool,
    pub alternative_rule_result: bool,
    pub claim_status: ClaimStatus,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct RuleProposal {
    pub rule_id: u64,
    pub turn_id: u64,
    pub proposer: Pubkey,
    pub sanitized_text_hash: [u8; 32],
    #[max_len(MAX_RULE_TEXT_BYTES)]
    pub sanitized_text: String,
    pub normalized_text_hash: [u8; 32],
    pub official_interpretation_hash: [u8; 32],
    pub compiled_artifact_hash: [u8; 32],
    pub token_count: u16,
    pub vote_count: u32,
    pub report_count: u32,
    pub state: RuleState,
    pub preflight_result_hash: [u8; 32],
    pub precompilation_status: PrecompilationStatus,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct RuleVote {
    pub turn_id: u64,
    pub rule_id: u64,
    pub voter: Pubkey,
    pub sequence: u64,
    pub fee_lamports: u64,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct RuleEliminationVote {
    pub turn_id: u64,
    pub rule_id: u64,
    pub voter: Pubkey,
    pub sequence: u64,
    pub fee_lamports: u64,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct RuleRemoval {
    pub turn_id: u64,
    pub rule_id: u64,
    pub remover: Pubkey,
    pub removal_kind: RuleRemovalKind,
    pub fee_lamports: u64,
    pub vote_count_at_removal: u32,
    pub removed_at: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct TreasuryVault {
    pub authority: Pubkey,
    pub total_collected_lamports: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PrizeVault {
    pub turn_id: u64,
    pub total_collected_lamports: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Claim {
    pub turn_id: u64,
    pub claimant: Pubkey,
    pub kind: ClaimKind,
    pub amount_lamports: u64,
    pub status: ClaimState,
    pub recorded_at: i64,
    pub claimed_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum ClaimKind {
    WinnerPayout,
    CreatorReward,
    VoterReward,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum ClaimState {
    Available,
    Claimed,
    /// The claim window closed unused and the reservation was released back to
    /// the turn's prize vault. Terminal: `claim_prize` requires `Available`.
    /// Appended last so previously written accounts keep their encoding.
    Expired,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum TurnStatus {
    Open,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum GameTokenStatus {
    Active,
    Closed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum VerificationStatus {
    Pending,
    Verified,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum ClaimStatus {
    Unavailable,
    Available,
    Claimed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum DrawStatus {
    NotRequested,
    Requested,
    Fulfilled,
    Failed,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum RuleState {
    Proposed,
    Eligible,
    Frozen,
    Eliminated,
    SurvivedElimination,
    Invalidated,
    Expired,
    RemovedPaid,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum RuleRemovalKind {
    CreatorSelf,
    ThirdParty,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Debug, InitSpace, PartialEq, Eq)]
pub enum PrecompilationStatus {
    Pending,
    Passed,
    Failed,
}

#[event]
pub struct GlobalConfigInitialized {
    pub authority: Pubkey,
    pub treasury_address: Pubkey,
}

#[event]
pub struct FounderPassConfigInitialized {
    pub authority: Pubkey,
    pub unresolved_decisions: u16,
}

#[event]
pub struct FounderPassConfigured {
    pub authority: Pubkey,
    pub asset_standard: FounderPassAssetStandard,
    pub asset_program_id: Pubkey,
    pub canonical_collection: Pubkey,
    pub campaign: Pubkey,
    /// Zero means every activation-gating §14 decision is resolved.
    pub unresolved_decisions: u16,
}

#[event]
pub struct FounderPassActivationChanged {
    pub authority: Pubkey,
    pub enabled: bool,
    pub paused: bool,
    pub activation_turn_id: u64,
    pub unresolved_decisions: u16,
}

#[event]
pub struct FounderPassSponsorVaultInitialized {
    pub authority: Pubkey,
}

#[event]
pub struct FounderPassSponsorVaultFunded {
    pub funder: Pubkey,
    pub amount_lamports: u64,
    pub total_funded_lamports: u64,
}

#[event]
pub struct FounderPassSponsorVaultWithdrawn {
    pub authority: Pubkey,
    pub recipient: Pubkey,
    pub amount_lamports: u64,
}

/// One pass-funded action (§9 indexing).
///
/// `waived_fee_lamports` is what the player would otherwise have paid and
/// `sponsor_lamports` is what the sponsor actually paid, so an indexer can
/// reconcile the turn's SOL ledgers under either §8 funding policy without
/// re-deriving the fee schedule. The three counters are the post-state of the
/// asset's lifetime quotas.
#[event]
pub struct FounderPassBenefitUsed {
    pub asset: Pubkey,
    pub owner: Pubkey,
    pub turn_id: u64,
    pub benefit: FounderPassBenefit,
    pub waived_fee_lamports: u64,
    pub sponsor_lamports: u64,
    pub vote_actions_used: u32,
    pub rule_proposals_used: u32,
    pub bets_used: u32,
}

#[event]
pub struct FounderPassUsageInitialized {
    pub asset: Pubkey,
    pub collection: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct VrfConfigUpdated {
    pub authority: Pubkey,
    pub old_draw_vrf_config: Pubkey,
    pub new_draw_vrf_config: Pubkey,
    pub old_election_vrf_config: Pubkey,
    pub new_election_vrf_config: Pubkey,
}

#[event]
pub struct TurnOpened {
    pub turn_id: u64,
    pub start_timestamp: i64,
    pub end_timestamp: i64,
    pub cycle_index: u8,
}

#[event]
pub struct TurnDurationCycleUpdated {
    pub turn_id: u64,
    pub old_duration_seconds: u32,
    pub new_duration_seconds: u32,
    pub old_end_timestamp: i64,
    pub new_end_timestamp: i64,
}

#[event]
pub struct GuessSubmitted {
    pub turn_id: u64,
    pub player: Pubkey,
    pub sequence: u64,
    pub fee_lamports: u64,
    pub guess: [u8; 6],
    pub game_token: Pubkey,
}

#[event]
pub struct RuleProposed {
    pub turn_id: u64,
    pub rule_id: u64,
    pub proposer: Pubkey,
    pub sanitized_text_hash: [u8; 32],
}

#[event]
pub struct RuleVoteCast {
    pub turn_id: u64,
    pub rule_id: u64,
    pub voter: Pubkey,
    pub sequence: u64,
    pub fee_lamports: u64,
}

#[event]
pub struct RuleRemoved {
    pub turn_id: u64,
    pub rule_id: u64,
    pub remover: Pubkey,
    pub removal_kind: RuleRemovalKind,
    pub fee_lamports: u64,
    pub vote_count_at_removal: u32,
}

#[event]
pub struct RuleEliminationVoteCast {
    pub turn_id: u64,
    pub rule_id: u64,
    pub voter: Pubkey,
    pub sequence: u64,
    pub fee_lamports: u64,
}

#[event]
pub struct RulePrecompiled {
    pub turn_id: u64,
    pub rule_id: u64,
    pub passed: bool,
    pub compiled_artifact_hash: [u8; 32],
}

#[event]
pub struct RuleElectionPoolLocked {
    pub turn_id: u64,
    pub eligible_rule_count: u16,
    pub eligible_rule_pool_hash: [u8; 32],
}

#[event]
pub struct RuleElectionVrfRequested {
    pub turn_id: u64,
    pub randomness_account: Pubkey,
}

#[event]
pub struct EliminationWindowClosed {
    pub turn_id: u64,
    pub eliminated_finalist_hash: [u8; 32],
    pub survivor_finalist_hash: [u8; 32],
}

#[event]
pub struct ActiveElectionVrfRequested {
    pub turn_id: u64,
    pub randomness_account: Pubkey,
}

#[event]
pub struct ActiveElectionSettled {
    pub turn_id: u64,
    pub active_rule_id: u64,
    pub elected_survivor_index: u8,
    pub randomness_source: Pubkey,
}

#[event]
pub struct StaleVrfRequestReset {
    pub turn_id: u64,
    pub stage: VrfStage,
    pub randomness_account: Pubkey,
}

#[event]
pub struct RuleElectionSettled {
    pub turn_id: u64,
    pub active_rule_id: u64,
    pub elected_finalist_index: u8,
    pub top_voted_finalist_hash: [u8; 32],
    pub random_finalist_hash: [u8; 32],
    pub finalist_set_hash: [u8; 32],
    pub randomness_source: Pubkey,
}

#[event]
pub struct TurnClosed {
    pub turn_id: u64,
    pub prize_pool_amount_lamports: u64,
}

#[event]
pub struct TurnTreasuryFeeBridged {
    pub turn_id: u64,
    pub epoch_id: u64,
    pub amount_lamports: u64,
}

#[event]
pub struct FeePoolCustodyMigrated {
    pub governance_authority: Pubkey,
    pub old_custody: Pubkey,
    pub fee_pool: Pubkey,
    pub transferred_lamports: u64,
    pub attributed_unbridged_lamports: u64,
    pub legacy_rollover_lamports: u64,
}

#[event]
pub struct TokenomicsEpochCollectionClosed {
    pub epoch_id: u64,
    pub last_completed_turn_id: u64,
}

#[event]
pub struct LegacyActiveTurnSkipped {
    pub turn_id: u64,
    pub legacy_data_len: u32,
    pub expected_data_len: u32,
}

#[event]
pub struct DrawRequested {
    pub turn_id: u64,
    pub randomness_account: Pubkey,
    pub requested_at: i64,
}

#[event]
pub struct DrawSettled {
    pub turn_id: u64,
    pub draw_result: [u8; 6],
    pub randomness_source: Pubkey,
    pub drawn_at: i64,
}

#[event]
pub struct DrawFailed {
    pub turn_id: u64,
    pub failure_code: u8,
    pub failed_at: i64,
}

#[event]
pub struct ClaimExpired {
    pub turn_id: u64,
    pub claimant: Pubkey,
    pub amount_lamports: u64,
    pub released_at: i64,
}

#[event]
pub struct PrizeRolloverSwept {
    pub source_turn_id: u64,
    pub destination_turn_id: u64,
    pub original_lamports: u64,
    pub alternative_lamports: u64,
}

#[event]
pub struct ClaimRecorded {
    pub turn_id: u64,
    pub claimant: Pubkey,
    pub kind: ClaimKind,
    pub amount_lamports: u64,
}

#[event]
pub struct ClaimSettled {
    pub turn_id: u64,
    pub claimant: Pubkey,
    pub kind: ClaimKind,
    pub amount_lamports: u64,
}

#[error_code]
pub enum TycheError {
    #[msg("The signer is not authorized for this instruction.")]
    Unauthorized,
    #[msg("The protocol is paused.")]
    ProtocolPaused,
    #[msg("A turn is already active.")]
    ActiveTurnExists,
    #[msg("There is no active turn.")]
    NoActiveTurn,
    #[msg("The turn id is invalid.")]
    InvalidTurnId,
    #[msg("The turn is not open.")]
    TurnNotOpen,
    #[msg("The turn is not closed.")]
    TurnNotClosed,
    #[msg("The turn has not ended.")]
    TurnNotEnded,
    #[msg("The action window is closed.")]
    ActionWindowClosed,
    #[msg("The configured cycle index is invalid.")]
    InvalidCycleIndex,
    #[msg("Turn durations must be positive.")]
    InvalidTurnDuration,
    #[msg("The active turn account is not a legacy undersized account.")]
    ActiveTurnStateNotLegacy,
    #[msg("The global config account is not a recognizable GlobalConfig.")]
    InvalidGlobalConfigAccount,
    #[msg("Basis points must be between 0 and 10,000.")]
    InvalidBasisPoints,
    #[msg("Election and guess cutoffs are invalid.")]
    InvalidCutoff,
    #[msg("The maximum rule token count must be positive.")]
    InvalidMaxRuleTokens,
    #[msg("At least one finalist slot is required.")]
    InvalidFinalistCounts,
    #[msg("Deprecated legacy rate-limit configuration is invalid.")]
    InvalidRateLimit,
    #[msg("A required configuration address is empty.")]
    InvalidConfigAddress,
    #[msg("Guess numbers must be between 1 and 100.")]
    InvalidGuessNumber,
    #[msg("Guess numbers must be unique.")]
    DuplicateGuessNumber,
    #[msg("Rule text must not be empty.")]
    EmptyRuleText,
    #[msg("Rule text exceeds the maximum byte length.")]
    RuleTextTooLong,
    #[msg("Rule token count is invalid.")]
    InvalidRuleTokenCount,
    #[msg("Rule text does not match its supplied hash.")]
    RuleTextHashMismatch,
    #[msg("The preflight commitment is invalid.")]
    InvalidPreflightCommitment,
    #[msg("The Game Token is invalid for this player or turn.")]
    InvalidGameToken,
    #[msg("The Game Token is inactive.")]
    InactiveGameToken,
    #[msg("The rule is not eligible for voting.")]
    RuleNotVoteable,
    #[msg("Deprecated legacy proposal-limit error; paid proposals use action sequencing.")]
    RuleProposalLimitReached,
    #[msg("Deprecated legacy vote-limit error; paid votes use action sequencing.")]
    VoteLimitReached,
    #[msg("The action sequence is invalid for this turn.")]
    InvalidActionSequence,
    #[msg("Arithmetic overflow or underflow.")]
    ArithmeticOverflow,
    #[msg("The randomness account address is empty.")]
    InvalidRandomnessAccount,
    #[msg("The draw cannot be requested in its current state.")]
    DrawNotRequestable,
    #[msg("The draw cannot be settled or failed in its current state.")]
    DrawNotSettleable,
    #[msg("The revealed randomness value is empty.")]
    InvalidRandomnessValue,
    #[msg("The randomness source does not match the requested account.")]
    RandomnessSourceMismatch,
    #[msg("The randomness account is not owned by the configured verifiable-randomness program.")]
    InvalidRandomnessOwner,
    #[msg("The randomness account does not belong to the configured randomness provider.")]
    RandomnessQueueMismatch,
    #[msg("The randomness commitment does not match the recorded request.")]
    RandomnessCommitSlotMismatch,
    #[msg("The verifiable randomness has not been fulfilled for settlement.")]
    RandomnessNotResolved,
    #[msg("This randomness account version is not supported.")]
    UnsupportedRandomnessAccountVersion,
    #[msg("The randomness request client does not match the Tyche authority.")]
    InvalidRandomnessClient,
    #[msg("The randomness was already fulfilled before the Tyche request was recorded.")]
    RandomnessAlreadyResolved,
    #[msg("A persistent randomness request cannot be failed, reset, or replaced.")]
    PersistentRandomnessCannotBeReset,
    #[msg("The draw failure code must be non-zero.")]
    InvalidDrawFailureCode,
    #[msg("The compiled rule artifact hash is invalid.")]
    InvalidCompiledArtifact,
    #[msg("The rule election cutoff has not been reached.")]
    ElectionCutoffNotReached,
    #[msg("The eligible election pool has not been locked.")]
    ElectionPoolNotLocked,
    #[msg("The rule election VRF has already been requested.")]
    ElectionVrfAlreadyRequested,
    #[msg("The rule election VRF has not been requested.")]
    ElectionVrfNotRequested,
    #[msg("The VRF stage has already been settled and cannot be reset.")]
    VrfAlreadySettled,
    #[msg("The recorded randomness account still exists on-chain and cannot be reset.")]
    RandomnessAccountStillExists,
    #[msg("The recomputed eligible pool hash does not match the locked hash.")]
    ElectionPoolHashMismatch,
    #[msg("The election candidate list includes a duplicate rule.")]
    DuplicateElectionCandidate,
    #[msg("The decision/elimination window is not open.")]
    EliminationWindowNotOpen,
    #[msg("The decision/elimination window has not closed yet.")]
    EliminationWindowNotClosed,
    #[msg("The rule is not in the locked finalist set.")]
    RuleNotFinalist,
    #[msg("The finalist was already eliminated.")]
    RuleAlreadyEliminated,
    #[msg("The finalist set has no surviving rule.")]
    NoSurvivingFinalist,
    #[msg("Paid rule removal is closed once the eligible rule pool is locked.")]
    RuleRemovalWindowClosed,
    #[msg("The rule is not in a removable state.")]
    RuleNotRemovable,
    #[msg("The rule has too many votes to be removed by paid action.")]
    RuleRemovalProtected,
    #[msg("The claimant address is empty.")]
    InvalidClaimant,
    #[msg("The claim amount is below the minimum claim threshold.")]
    ClaimBelowMinimum,
    #[msg("The claim is not available to settle.")]
    ClaimNotAvailable,
    #[msg("The claim kind does not match the requested vault.")]
    ClaimKindMismatch,
    #[msg("The vault has insufficient lamports above its rent-exempt minimum.")]
    InsufficientVaultBalance,
    #[msg("The turn treasury fee was already bridged to Tokenomics Core.")]
    TreasuryFeeAlreadyBridged,
    #[msg("The Tokenomics Core configuration does not authorize this game.")]
    InvalidTokenomicsConfiguration,
    #[msg("The Tokenomics Core epoch does not accept this turn.")]
    InvalidTokenomicsEpoch,
    #[msg("The token reward account is not owned by the recorded beneficiary.")]
    InvalidRewardBeneficiary,
    #[msg("The supplied Tokenomics Core reward fact does not match the game state.")]
    InvalidTokenomicsRewardFact,
    #[msg("Only the rule creator can remove this rule.")]
    RuleRemovalNotCreator,
    #[msg("The supplied ProgramData account is not the canonical account for Tyche.")]
    InvalidProgramData,
    #[msg("The signer is not the current Tyche program upgrade authority.")]
    InvalidGovernanceAuthority,
    #[msg("The recorded claim exceeds the turn prize vault's unreserved balance.")]
    ClaimExceedsPrizeVault,
    #[msg("Prize rollover must move forward from an earlier turn to a later one.")]
    InvalidRolloverDirection,
    #[msg("The declared rollover split does not equal the source vault's unreserved balance.")]
    RolloverAmountMismatch,
    #[msg("The source prize vault still holds lamports owed to a recorded claim.")]
    PrizeVaultHasOutstandingClaims,
    #[msg("The claim window has not closed, so the payout still belongs to its winner.")]
    ClaimWindowStillOpen,
    #[msg("Direct fee routing has not been activated.")]
    DirectFeeRoutingInactive,
    #[msg("The supplied fee pool is not the canonical Tokenomics distribution vault.")]
    InvalidFeePool,
    #[msg("The fee-pool custody migration was already applied or is not in its legacy state.")]
    FeePoolMigrationAlreadyApplied,
    #[msg("The fee-pool migration amounts do not reconcile with legacy custody.")]
    InvalidFeePoolMigrationAmounts,
    // Founder Pass (PRD-FOUNDER-PASS-NFT.md, FP1). Appended so existing error
    // codes keep their numbering.
    #[msg("The stored Founder Pass allowances do not match the confirmed product limits.")]
    InvalidFounderPassAllowance,
    #[msg("The Founder Pass usage account violates its representation invariant.")]
    InvalidFounderPassUsage,
    #[msg("The supplied account is not a valid Founder Pass asset of the configured standard.")]
    InvalidFounderPassAsset,
    #[msg("The Founder Pass asset is not owned by the configured asset programme.")]
    InvalidFounderPassAssetProgram,
    #[msg("No Founder Pass asset standard has been governed, so no asset can be verified.")]
    FounderPassAssetStandardUnset,
    #[msg("The signing wallet is not the current owner of the Founder Pass asset.")]
    FounderPassNotOwned,
    #[msg("The Founder Pass asset does not belong to the canonical collection.")]
    FounderPassCollectionMismatch,
    #[msg("The Founder Pass asset is frozen, so its recorded owner is not its current controller.")]
    FounderPassAssetFrozen,
    #[msg("The Founder Pass active-turn window has not opened for this turn or has already closed.")]
    FounderPassTurnWindowClosed,
    #[msg("The Founder Pass has used all 1,000 fee-free vote actions.")]
    FounderPassVoteAllowanceExhausted,
    #[msg("The Founder Pass has used all 100 fee-free rule proposals.")]
    FounderPassProposalAllowanceExhausted,
    #[msg("The Founder Pass has used all 50 fee-free submitted bets.")]
    FounderPassBetAllowanceExhausted,
    #[msg("Founder Pass benefits cannot be activated while a governed decision is unresolved.")]
    FounderPassDecisionsUnresolved,
    #[msg("Founder Pass benefits are active; changing the configuration requires a governed migration.")]
    FounderPassAlreadyActivated,
    #[msg("Founder Pass benefits are disabled or paused.")]
    FounderPassInactive,
    #[msg("The Founder Pass vote concentration limit exceeds the lifetime vote allowance.")]
    InvalidFounderPassConcentrationLimit,
    #[msg("The Founder Pass activation turn anchors the shared window and cannot be changed.")]
    FounderPassActivationTurnImmutable,
    // FP2. Appended, so every error code above keeps its existing numbering.
    #[msg("This action is already free, so it does not consume a Founder Pass benefit.")]
    FounderPassBenefitNotApplicable,
    #[msg("The Founder Pass fee-waiver funding policy is unresolved.")]
    FounderPassFeeWaiverFundingUnset,
    #[msg("The Founder Pass sponsor vault cannot cover the waived fee.")]
    FounderPassSponsorUnderfunded,
    #[msg("This wallet reached the Founder Pass vote concentration limit for this rule and turn.")]
    FounderPassVoteConcentrationExceeded,
    #[msg("This wallet reached the number of distinct Founder Passes it may use in this turn.")]
    FounderPassWalletPassLimitExceeded,
    #[msg("The Founder Pass per-wallet turn record does not match its wallet or turn.")]
    InvalidFounderPassWalletTurn,
    #[msg("The Founder Pass vote concentration record does not match its wallet, rule, or turn.")]
    InvalidFounderPassVoteConcentration,
    #[msg("The Founder Pass usage account does not belong to the supplied asset.")]
    FounderPassUsageMismatch,
    #[msg("The Founder Pass sponsor vault record is invalid.")]
    InvalidFounderPassSponsorVault,
    #[msg("The sponsor vault amount must be greater than zero.")]
    InvalidFounderPassSponsorAmount,
}
