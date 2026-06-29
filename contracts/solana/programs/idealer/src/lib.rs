// ============================================================
// Program: Idealer
// Framework: Anchor
// Testing: Rust unit and integration tests
// Risk Level: Critical
// Security: See contracts/solana/security-checklist.md
// ============================================================

use anchor_lang::prelude::*;
use anchor_lang::system_program::{self, Transfer};

pub mod domain;

use domain::{
    derive_draw_numbers, next_cycle_index, run_rule_election, split_fee, validate_action_window,
    validate_config, validate_guess, validate_rule, ConfigValidation, ElectionCandidate,
    VOTE_FEE_START_TURN,
};
use solana_sha256_hasher::hash;
use switchboard_on_demand::RandomnessAccountData;

declare_id!("6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4");

pub const TURN_DURATION_CYCLE_LEN: usize = 4;
pub const MAX_FINALISTS: usize = 10;
pub const REPEATED_ACTION_FEE_MULTIPLIER: u64 = 2;
/// Fixed 1-hour decision/elimination window (PRD §5.4/§6.14a). Under the
/// test-only `devnet-test` feature it collapses to a few seconds so the full
/// election → elimination → active-election pipeline can be validated end-to-end
/// on devnet without a real 1-hour wait; production builds keep the full hour.
#[cfg(feature = "devnet-test")]
pub const ELIMINATION_WINDOW_SECONDS: i64 = 5;
#[cfg(not(feature = "devnet-test"))]
pub const ELIMINATION_WINDOW_SECONDS: i64 = 3_600;
pub const MAX_RULE_TEXT_BYTES: usize = 6000;
pub const BASIS_POINTS_DENOMINATOR: u16 = 10_000;

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

/// Parse a committed Switchboard On-Demand randomness account and return its
/// configured queue + committed seed slot, after verifying the account is owned
/// by the Switchboard program and originates from the trusted VRF queue.
///
/// Used by the `request_*` (commit) instructions so the queue/owner are checked
/// once at commit time and the seed slot is recorded for the later settle.
fn read_committed_randomness(
    randomness_ai: &AccountInfo,
    expected_queue: &Pubkey,
) -> Result<u64> {
    require!(
        randomness_ai.owner.to_bytes() == expected_switchboard_program(),
        IdealerError::InvalidRandomnessOwner
    );
    let data = randomness_ai.try_borrow_data()?;
    let randomness = RandomnessAccountData::parse(data)
        .map_err(|_| error!(IdealerError::InvalidRandomnessAccount))?;
    require!(
        randomness.queue.to_bytes() == expected_queue.to_bytes(),
        IdealerError::RandomnessQueueMismatch
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
    expected_queue: &Pubkey,
    expected_commit_slot: u64,
    clock: &Clock,
) -> Result<[u8; 32]> {
    require_keys_eq!(
        randomness_ai.key(),
        *expected_account,
        IdealerError::RandomnessSourceMismatch
    );
    require!(
        randomness_ai.owner.to_bytes() == expected_switchboard_program(),
        IdealerError::InvalidRandomnessOwner
    );
    let data = randomness_ai.try_borrow_data()?;
    let randomness = RandomnessAccountData::parse(data)
        .map_err(|_| error!(IdealerError::InvalidRandomnessAccount))?;
    require!(
        randomness.queue.to_bytes() == expected_queue.to_bytes(),
        IdealerError::RandomnessQueueMismatch
    );
    require!(
        randomness.seed_slot == expected_commit_slot,
        IdealerError::RandomnessCommitSlotMismatch
    );
    let value = randomness
        .get_value(clock.slot)
        .map_err(|_| error!(IdealerError::RandomnessNotResolved))?;
    require!(value != [0; 32], IdealerError::InvalidRandomnessValue);
    Ok(value)
}

#[program]
pub mod idealer {
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
            IdealerError::InvalidConfigAddress
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
        treasury_vault.authority = args.treasury_address;
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
            IdealerError::InvalidConfigAddress
        );

        let config = &mut ctx.accounts.global_config;
        let old_draw_vrf_config = config.draw_vrf_config;
        let old_election_vrf_config = config.election_vrf_config;
        config.draw_vrf_config = args.draw_vrf_config;
        config.election_vrf_config = args.election_vrf_config;

        emit!(VrfConfigUpdated {
            authority: ctx.accounts.authority.key(),
            old_draw_vrf_config,
            new_draw_vrf_config: config.draw_vrf_config,
            old_election_vrf_config,
            new_election_vrf_config: config.election_vrf_config,
        });
        Ok(())
    }

    pub fn open_turn(ctx: Context<OpenTurn>, turn_id: u64) -> Result<()> {
        let config = &mut ctx.accounts.global_config;
        require!(!config.paused, IdealerError::ProtocolPaused);
        require!(!config.has_active_turn, IdealerError::ActiveTurnExists);
        require_eq!(turn_id, config.next_turn_id, IdealerError::InvalidTurnId);

        let cycle_index = config.active_turn_duration_index;
        let turn_duration_seconds = *config
            .turn_duration_cycle
            .get(usize::from(cycle_index))
            .ok_or(IdealerError::InvalidCycleIndex)?;
        let clock = Clock::get()?;
        let end_timestamp = clock
            .unix_timestamp
            .checked_add(i64::from(turn_duration_seconds))
            .ok_or(IdealerError::ArithmeticOverflow)?;

        let turn = &mut ctx.accounts.turn_state;
        turn.turn_id = turn_id;
        turn.start_timestamp = clock.unix_timestamp;
        turn.end_timestamp = end_timestamp;
        turn.status = TurnStatus::Open;
        turn.prize_pool_amount_lamports = 0;
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
        turn.elimination_window_start_timestamp = 0;
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
        require!(!config.paused, IdealerError::ProtocolPaused);
        require!(config.has_active_turn, IdealerError::NoActiveTurn);
        require_eq!(
            config.active_turn_id,
            ctx.accounts.turn_state.turn_id,
            IdealerError::InvalidTurnId
        );
        require!(
            ctx.accounts.turn_state.status == TurnStatus::Open,
            IdealerError::TurnNotOpen
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
            .ok_or(IdealerError::InvalidCycleIndex)?;
        let new_end_timestamp = turn
            .start_timestamp
            .checked_add(i64::from(new_duration_seconds))
            .ok_or(IdealerError::ArithmeticOverflow)?;

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
        require!(args.sequence == 1, IdealerError::InvalidActionSequence);
        submit_guess_with_game_token_init(ctx, args)
    }

    pub fn submit_additional_guess(
        ctx: Context<SubmitAdditionalGuess>,
        args: SubmitGuessArgs,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        validate_action_window(
            clock.unix_timestamp,
            ctx.accounts.turn_state.start_timestamp,
            ctx.accounts.turn_state.end_timestamp,
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
            .ok_or(IdealerError::ArithmeticOverflow)?;
        require!(
            args.sequence == expected_sequence,
            IdealerError::InvalidActionSequence
        );
        let fee_lamports = repeated_action_fee_lamports(
            config.guess_submission_fee_lamports,
            ctx.accounts.turn_state.turn_id,
            args.sequence,
        )?;

        collect_fee(
            &ctx.accounts.player,
            &ctx.accounts.treasury_vault,
            &ctx.accounts.prize_vault,
            &ctx.accounts.system_program,
            fee_lamports,
            config.treasury_fee_bps,
        )?;
        let (treasury_amount, prize_amount) = split_fee(fee_lamports, config.treasury_fee_bps)?;

        let guess = &mut ctx.accounts.player_guess;
        guess.turn_id = ctx.accounts.turn_state.turn_id;
        guess.player = ctx.accounts.player.key();
        guess.sequence = args.sequence;
        guess.fee_lamports = fee_lamports;
        guess.numbers = args.numbers;
        guess.submitted_at = clock.unix_timestamp;
        guess.game_token = ctx.accounts.game_token.key();
        guess.verification_status = VerificationStatus::Pending;
        guess.original_rule_result = false;
        guess.alternative_rule_result = false;
        guess.claim_status = ClaimStatus::Unavailable;
        guess.bump = ctx.bumps.player_guess;

        ctx.accounts.game_token.issuing_guess = guess.key();
        ctx.accounts.game_token.guess_count = args.sequence;

        ctx.accounts.treasury_vault.total_collected_lamports = ctx
            .accounts
            .treasury_vault
            .total_collected_lamports
            .checked_add(treasury_amount)
            .ok_or(IdealerError::ArithmeticOverflow)?;
        ctx.accounts.prize_vault.total_collected_lamports = ctx
            .accounts
            .prize_vault
            .total_collected_lamports
            .checked_add(prize_amount)
            .ok_or(IdealerError::ArithmeticOverflow)?;
        ctx.accounts.turn_state.prize_pool_amount_lamports = ctx
            .accounts
            .turn_state
            .prize_pool_amount_lamports
            .checked_add(prize_amount)
            .ok_or(IdealerError::ArithmeticOverflow)?;

        emit!(GuessSubmitted {
            turn_id: guess.turn_id,
            player: guess.player,
            sequence: guess.sequence,
            fee_lamports: guess.fee_lamports,
            guess: args.numbers,
            game_token: ctx.accounts.game_token.key(),
        });
        Ok(())
    }

    pub fn propose_rule(ctx: Context<ProposeRule>, args: ProposeRuleArgs) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        validate_action_window(
            clock.unix_timestamp,
            ctx.accounts.turn_state.start_timestamp,
            ctx.accounts.turn_state.end_timestamp,
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
            .ok_or(IdealerError::ArithmeticOverflow)?;
        let proposal_fee = repeated_action_fee_lamports(
            config.rule_proposal_fee_lamports,
            ctx.accounts.turn_state.turn_id,
            proposal_sequence,
        )?;

        collect_fee(
            &ctx.accounts.proposer,
            &ctx.accounts.treasury_vault,
            &ctx.accounts.prize_vault,
            &ctx.accounts.system_program,
            proposal_fee,
            config.treasury_fee_bps,
        )?;
        let (treasury_amount, prize_amount) = split_fee(proposal_fee, config.treasury_fee_bps)?;

        let proposal = &mut ctx.accounts.rule_proposal;
        proposal.rule_id = args.rule_id;
        proposal.turn_id = ctx.accounts.turn_state.turn_id;
        proposal.proposer = ctx.accounts.proposer.key();
        proposal.sanitized_text_hash = args.sanitized_text_hash;
        proposal.sanitized_text = args.sanitized_text;
        proposal.normalized_text_hash = args.normalized_text_hash;
        proposal.official_interpretation_hash = args.official_interpretation_hash;
        proposal.compiled_artifact_hash = [0; 32];
        proposal.token_count = args.token_count;
        proposal.vote_count = 0;
        proposal.report_count = 0;
        proposal.state = RuleState::Proposed;
        proposal.preflight_result_hash = args.preflight_result_hash;
        proposal.precompilation_status = PrecompilationStatus::Pending;
        proposal.created_at = clock.unix_timestamp;
        proposal.bump = ctx.bumps.rule_proposal;

        ctx.accounts.game_token.used_for_rule_proposal_count = ctx
            .accounts
            .game_token
            .used_for_rule_proposal_count
            .checked_add(1)
            .ok_or(IdealerError::ArithmeticOverflow)?;
        ctx.accounts.treasury_vault.total_collected_lamports = ctx
            .accounts
            .treasury_vault
            .total_collected_lamports
            .checked_add(treasury_amount)
            .ok_or(IdealerError::ArithmeticOverflow)?;
        ctx.accounts.prize_vault.total_collected_lamports = ctx
            .accounts
            .prize_vault
            .total_collected_lamports
            .checked_add(prize_amount)
            .ok_or(IdealerError::ArithmeticOverflow)?;
        ctx.accounts.turn_state.prize_pool_amount_lamports = ctx
            .accounts
            .turn_state
            .prize_pool_amount_lamports
            .checked_add(prize_amount)
            .ok_or(IdealerError::ArithmeticOverflow)?;

        emit!(RuleProposed {
            turn_id: proposal.turn_id,
            rule_id: proposal.rule_id,
            proposer: proposal.proposer,
            sanitized_text_hash: proposal.sanitized_text_hash,
        });
        Ok(())
    }

    pub fn vote_rule(ctx: Context<VoteRule>, args: VoteRuleArgs) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        validate_action_window(
            clock.unix_timestamp,
            ctx.accounts.turn_state.start_timestamp,
            ctx.accounts.turn_state.end_timestamp,
            config.rule_election_cutoff_bps,
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
            IdealerError::RuleNotVoteable
        );
        require!(args.sequence > 0, IdealerError::InvalidActionSequence);

        let vote_fee = repeated_action_fee_lamports(
            config.vote_fee_lamports,
            ctx.accounts.turn_state.turn_id,
            args.sequence,
        )?;
        collect_prize_pool_fee(
            &ctx.accounts.voter,
            &ctx.accounts.prize_vault,
            &ctx.accounts.system_program,
            vote_fee,
        )?;

        let vote = &mut ctx.accounts.rule_vote;
        vote.turn_id = ctx.accounts.turn_state.turn_id;
        vote.rule_id = ctx.accounts.rule_proposal.rule_id;
        vote.voter = ctx.accounts.voter.key();
        vote.sequence = args.sequence;
        vote.fee_lamports = vote_fee;
        vote.created_at = clock.unix_timestamp;
        vote.bump = ctx.bumps.rule_vote;

        ctx.accounts.rule_proposal.vote_count = ctx
            .accounts
            .rule_proposal
            .vote_count
            .checked_add(1)
            .ok_or(IdealerError::ArithmeticOverflow)?;
        ctx.accounts.game_token.used_for_vote_count = ctx
            .accounts
            .game_token
            .used_for_vote_count
            .checked_add(1)
            .ok_or(IdealerError::ArithmeticOverflow)?;
        ctx.accounts.prize_vault.total_collected_lamports = ctx
            .accounts
            .prize_vault
            .total_collected_lamports
            .checked_add(vote_fee)
            .ok_or(IdealerError::ArithmeticOverflow)?;
        ctx.accounts.turn_state.prize_pool_amount_lamports = ctx
            .accounts
            .turn_state
            .prize_pool_amount_lamports
            .checked_add(vote_fee)
            .ok_or(IdealerError::ArithmeticOverflow)?;

        emit!(RuleVoteCast {
            turn_id: vote.turn_id,
            rule_id: vote.rule_id,
            voter: vote.voter,
            sequence: vote.sequence,
            fee_lamports: vote.fee_lamports,
        });
        Ok(())
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
            IdealerError::RuleRemovalWindowClosed
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
            IdealerError::RuleNotRemovable
        );

        // Differentiated vote protection: the creator cannot self-remove a rule
        // that already has community momentum, and third parties have an even
        // higher threshold (PRD §6.11 / RULE_REMOVAL_CONFIG).
        let is_creator = ctx.accounts.rule_proposal.proposer == ctx.accounts.remover.key();
        let threshold = if is_creator {
            config.min_votes_creator_self_remove
        } else {
            config.min_votes_third_party_remove
        };
        require!(
            ctx.accounts.rule_proposal.vote_count < threshold,
            IdealerError::RuleRemovalProtected
        );

        // The removal fee is routed to the current turn prize pool, retaining the
        // standard protocol treasury fee like every other prize-pool source
        // (PRD §2.5 / §6.11 "follows normal treasury/prize-pool accounting").
        let fee = config.rule_removal_fee_lamports;
        collect_fee(
            &ctx.accounts.remover,
            &ctx.accounts.treasury_vault,
            &ctx.accounts.prize_vault,
            &ctx.accounts.system_program,
            fee,
            config.treasury_fee_bps,
        )?;
        let (treasury_amount, prize_amount) = split_fee(fee, config.treasury_fee_bps)?;

        let removal_kind = if is_creator {
            RuleRemovalKind::CreatorSelf
        } else {
            RuleRemovalKind::ThirdParty
        };
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

        ctx.accounts.treasury_vault.total_collected_lamports = ctx
            .accounts
            .treasury_vault
            .total_collected_lamports
            .checked_add(treasury_amount)
            .ok_or(IdealerError::ArithmeticOverflow)?;
        ctx.accounts.prize_vault.total_collected_lamports = ctx
            .accounts
            .prize_vault
            .total_collected_lamports
            .checked_add(prize_amount)
            .ok_or(IdealerError::ArithmeticOverflow)?;
        ctx.accounts.turn_state.prize_pool_amount_lamports = ctx
            .accounts
            .turn_state
            .prize_pool_amount_lamports
            .checked_add(prize_amount)
            .ok_or(IdealerError::ArithmeticOverflow)?;

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
        validate_action_window(
            clock.unix_timestamp,
            ctx.accounts.turn_state.start_timestamp,
            ctx.accounts.turn_state.end_timestamp,
            config.rule_election_cutoff_bps,
        )?;

        let proposal = &mut ctx.accounts.rule_proposal;
        if args.passed {
            require!(
                args.compiled_artifact_hash != [0; 32],
                IdealerError::InvalidCompiledArtifact
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
        require!(!config.paused, IdealerError::ProtocolPaused);
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
    pub fn request_rule_election_vrf(ctx: Context<RequestRuleElectionVrf>) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, IdealerError::ProtocolPaused);
        require_election_cutoff_reached(config, &ctx.accounts.turn_state)?;
        require!(
            ctx.accounts.turn_state.eligible_rule_pool_hash != [0; 32],
            IdealerError::ElectionPoolNotLocked
        );
        require!(
            ctx.accounts.turn_state.election_vrf_request == Pubkey::default(),
            IdealerError::ElectionVrfAlreadyRequested
        );

        let randomness_account = ctx.accounts.randomness.key();
        let commit_slot =
            read_committed_randomness(&ctx.accounts.randomness, &config.election_vrf_config)?;
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
        require!(!config.paused, IdealerError::ProtocolPaused);
        require_election_cutoff_reached(config, &ctx.accounts.turn_state)?;
        require!(
            ctx.accounts.turn_state.election_vrf_request != Pubkey::default(),
            IdealerError::ElectionVrfNotRequested
        );

        let clock = Clock::get()?;
        let randomness_source = ctx.accounts.randomness.key();
        let randomness = verify_revealed_randomness(
            &ctx.accounts.randomness,
            &ctx.accounts.turn_state.election_vrf_request,
            &config.election_vrf_config,
            ctx.accounts.turn_state.election_commit_slot,
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
            IdealerError::ElectionPoolHashMismatch
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
            require!(index < MAX_FINALISTS, IdealerError::InvalidFinalistCounts);
            let candidate = candidates
                .iter()
                .find(|candidate| candidate.rule_id == *rule_id)
                .ok_or(IdealerError::InvalidTurnId)?;
            turn.finalist_rule_ids[index] = *rule_id;
            turn.finalist_approval_vote_counts[index] = candidate.vote_count;
        }
        turn.elimination_window_start_timestamp = clock.unix_timestamp;
        turn.elimination_window_end_timestamp = clock
            .unix_timestamp
            .checked_add(ELIMINATION_WINDOW_SECONDS)
            .ok_or(IdealerError::ArithmeticOverflow)?;
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
        require!(
            ctx.accounts.turn_state.finalist_count > 0
                && ctx.accounts.turn_state.elimination_window_start_timestamp > 0,
            IdealerError::EliminationWindowNotOpen
        );
        require!(
            clock.unix_timestamp >= ctx.accounts.turn_state.elimination_window_start_timestamp
                && clock.unix_timestamp < ctx.accounts.turn_state.elimination_window_end_timestamp,
            IdealerError::EliminationWindowNotOpen
        );
        let index = finalist_index(&ctx.accounts.turn_state, ctx.accounts.rule_proposal.rule_id)
            .ok_or(IdealerError::RuleNotFinalist)?;
        require!(
            !ctx.accounts.turn_state.finalist_eliminated[index],
            IdealerError::RuleAlreadyEliminated
        );
        require!(args.sequence > 0, IdealerError::InvalidActionSequence);

        let fee = repeated_action_fee_lamports(
            config.vote_fee_lamports,
            ctx.accounts.turn_state.turn_id,
            args.sequence,
        )?;
        collect_prize_pool_fee(
            &ctx.accounts.voter,
            &ctx.accounts.prize_vault,
            &ctx.accounts.system_program,
            fee,
        )?;

        let vote = &mut ctx.accounts.rule_elimination_vote;
        vote.turn_id = ctx.accounts.turn_state.turn_id;
        vote.rule_id = ctx.accounts.rule_proposal.rule_id;
        vote.voter = ctx.accounts.voter.key();
        vote.sequence = args.sequence;
        vote.fee_lamports = fee;
        vote.created_at = clock.unix_timestamp;
        vote.bump = ctx.bumps.rule_elimination_vote;

        let turn = &mut ctx.accounts.turn_state;
        turn.finalist_elimination_vote_counts[index] = turn.finalist_elimination_vote_counts[index]
            .checked_add(1)
            .ok_or(IdealerError::ArithmeticOverflow)?;
        turn.prize_pool_amount_lamports = turn
            .prize_pool_amount_lamports
            .checked_add(fee)
            .ok_or(IdealerError::ArithmeticOverflow)?;
        ctx.accounts.prize_vault.total_collected_lamports = ctx
            .accounts
            .prize_vault
            .total_collected_lamports
            .checked_add(fee)
            .ok_or(IdealerError::ArithmeticOverflow)?;

        emit!(RuleEliminationVoteCast {
            turn_id: vote.turn_id,
            rule_id: vote.rule_id,
            voter: vote.voter,
            sequence: vote.sequence,
            fee_lamports: fee,
        });
        Ok(())
    }

    pub fn close_elimination_window(ctx: Context<CloseEliminationWindow>) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        require!(
            ctx.accounts.turn_state.finalist_count > 0
                && ctx.accounts.turn_state.elimination_window_end_timestamp > 0,
            IdealerError::EliminationWindowNotOpen
        );
        require!(
            clock.unix_timestamp >= ctx.accounts.turn_state.elimination_window_end_timestamp,
            IdealerError::EliminationWindowNotClosed
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
        require!(!survivors.is_empty(), IdealerError::NoSurvivingFinalist);
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
            IdealerError::EliminationWindowNotClosed
        );
        require!(
            ctx.accounts.turn_state.active_election_vrf_request == Pubkey::default(),
            IdealerError::ElectionVrfAlreadyRequested
        );

        let randomness_account = ctx.accounts.randomness.key();
        let commit_slot =
            read_committed_randomness(&ctx.accounts.randomness, &config.election_vrf_config)?;
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
            IdealerError::ElectionVrfNotRequested
        );

        let clock = Clock::get()?;
        let randomness_source = ctx.accounts.randomness.key();
        let randomness = verify_revealed_randomness(
            &ctx.accounts.randomness,
            &ctx.accounts.turn_state.active_election_vrf_request,
            &config.election_vrf_config,
            ctx.accounts.turn_state.active_election_commit_slot,
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
            .ok_or(IdealerError::RuleNotFinalist)?;
        let data = active_proposal_info.try_borrow_data()?;
        let mut data_ref: &[u8] = &data;
        let active = RuleProposal::try_deserialize(&mut data_ref)?;

        turn.active_rule_id = active_rule_id;
        turn.active_rule_hash = active.sanitized_text_hash;
        turn.frozen_rule_artifact_hash = active.compiled_artifact_hash;
        turn.active_election_vrf_fulfillment = randomness_source;
        turn.elected_survivor_index = survivor_index as u8;
        turn.elected_finalist_index =
            finalist_index(turn, active_rule_id).ok_or(IdealerError::RuleNotFinalist)? as u8;

        emit!(ActiveElectionSettled {
            turn_id: turn.turn_id,
            active_rule_id,
            elected_survivor_index: turn.elected_survivor_index,
            randomness_source,
        });
        Ok(())
    }

    pub fn close_turn(ctx: Context<CloseTurn>) -> Result<()> {
        let clock = Clock::get()?;
        let config = &mut ctx.accounts.global_config;
        require!(!config.paused, IdealerError::ProtocolPaused);
        require!(config.has_active_turn, IdealerError::NoActiveTurn);
        require_eq!(
            config.active_turn_id,
            ctx.accounts.turn_state.turn_id,
            IdealerError::InvalidTurnId
        );
        require!(
            ctx.accounts.turn_state.status == TurnStatus::Open,
            IdealerError::TurnNotOpen
        );
        require!(
            clock.unix_timestamp >= ctx.accounts.turn_state.end_timestamp,
            IdealerError::TurnNotEnded
        );

        ctx.accounts.turn_state.status = TurnStatus::Closed;
        config.has_active_turn = false;
        config.active_turn_id = 0;
        config.next_turn_id = config
            .next_turn_id
            .checked_add(1)
            .ok_or(IdealerError::ArithmeticOverflow)?;
        config.active_turn_duration_index = next_cycle_index(config.active_turn_duration_index)?;

        emit!(TurnClosed {
            turn_id: ctx.accounts.turn_state.turn_id,
            prize_pool_amount_lamports: ctx.accounts.turn_state.prize_pool_amount_lamports,
        });
        Ok(())
    }

    pub fn force_skip_legacy_active_turn(ctx: Context<ForceSkipLegacyActiveTurn>) -> Result<()> {
        let config = &mut ctx.accounts.global_config;
        require!(!config.paused, IdealerError::ProtocolPaused);
        require!(config.has_active_turn, IdealerError::NoActiveTurn);

        let active_turn_id = config.active_turn_id;
        let active_turn_id_bytes = active_turn_id.to_le_bytes();
        let (expected_turn_state, _) = Pubkey::find_program_address(
            &[b"turn".as_ref(), active_turn_id_bytes.as_ref()],
            ctx.program_id,
        );
        require_keys_eq!(
            ctx.accounts.turn_state.key(),
            expected_turn_state,
            IdealerError::InvalidTurnId
        );
        require_keys_eq!(
            *ctx.accounts.turn_state.to_account_info().owner,
            crate::ID,
            IdealerError::InvalidTurnId
        );
        require!(
            ctx.accounts.turn_state.to_account_info().data_len() < 8 + TurnState::INIT_SPACE,
            IdealerError::ActiveTurnStateNotLegacy
        );

        config.has_active_turn = false;
        config.active_turn_id = 0;
        config.next_turn_id = active_turn_id
            .checked_add(1)
            .ok_or(IdealerError::ArithmeticOverflow)?;
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
        require!(!config.paused, IdealerError::ProtocolPaused);

        let randomness_account = ctx.accounts.randomness.key();
        let commit_slot =
            read_committed_randomness(&ctx.accounts.randomness, &config.draw_vrf_config)?;

        let clock = Clock::get()?;
        let turn = &mut ctx.accounts.turn_state;
        require!(
            clock.unix_timestamp >= turn.end_timestamp,
            IdealerError::TurnNotEnded
        );
        require!(
            matches!(
                turn.draw_status,
                DrawStatus::NotRequested | DrawStatus::Failed
            ),
            IdealerError::DrawNotRequestable
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
        require!(!config.paused, IdealerError::ProtocolPaused);
        require!(
            ctx.accounts.turn_state.draw_status == DrawStatus::Requested,
            IdealerError::DrawNotSettleable
        );

        let clock = Clock::get()?;
        let randomness_source = ctx.accounts.randomness.key();
        let value = verify_revealed_randomness(
            &ctx.accounts.randomness,
            &ctx.accounts.turn_state.draw_vrf_request,
            &config.draw_vrf_config,
            ctx.accounts.turn_state.draw_commit_slot,
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
        require!(!config.paused, IdealerError::ProtocolPaused);
        require!(failure_code != 0, IdealerError::InvalidDrawFailureCode);

        let clock = Clock::get()?;
        let turn = &mut ctx.accounts.turn_state;
        require!(
            turn.draw_status == DrawStatus::Requested,
            IdealerError::DrawNotSettleable
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

    /// Authority posts the off-chain-computed claimable amount for a single
    /// `(turn, wallet, kind)` so the wallet can later pull its funds on-chain.
    /// The winner/creator/voter amounts are computed deterministically by the
    /// API after the draw; this instruction mirrors a single claim record on
    /// chain. Creating the `Claim` PDA via `init` makes it idempotent: a second
    /// post for the same tuple fails, so the worker can treat "already exists"
    /// as success.
    pub fn record_claim(ctx: Context<RecordClaim>, args: RecordClaimArgs) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, IdealerError::ProtocolPaused);
        require!(
            args.claimant != Pubkey::default(),
            IdealerError::InvalidClaimant
        );
        require!(
            ctx.accounts.turn_state.draw_status == DrawStatus::Fulfilled,
            IdealerError::DrawNotSettleable
        );
        require!(
            args.amount_lamports >= config.minimum_claim_threshold_lamports,
            IdealerError::ClaimBelowMinimum
        );

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
            IdealerError::ProtocolPaused
        );
        require!(
            ctx.accounts.claim.kind == ClaimKind::WinnerPayout,
            IdealerError::ClaimKindMismatch
        );
        require!(
            ctx.accounts.claim.status == ClaimState::Available,
            IdealerError::ClaimNotAvailable
        );

        let amount = ctx.accounts.claim.amount_lamports;
        let claimant_key = ctx.accounts.claimant.key();
        let clock = Clock::get()?;

        // Checks-Effects-Interactions: mark claimed before moving lamports.
        let claim = &mut ctx.accounts.claim;
        claim.status = ClaimState::Claimed;
        claim.claimed_at = clock.unix_timestamp;

        pay_from_vault(
            &ctx.accounts.prize_vault.to_account_info(),
            &ctx.accounts.claimant.to_account_info(),
            amount,
        )?;
        ctx.accounts.prize_vault.total_collected_lamports = ctx
            .accounts
            .prize_vault
            .total_collected_lamports
            .saturating_sub(amount);

        emit!(ClaimSettled {
            turn_id,
            claimant: claimant_key,
            kind: ClaimKind::WinnerPayout,
            amount_lamports: amount,
        });
        Ok(())
    }

    /// Pull a recorded creator or voter reward from the global treasury vault,
    /// which holds platform monetization and acts as the creator-reward
    /// reserve. Signed by the claimant wallet (pull-payment). Winner payouts
    /// must use `claim_prize` instead.
    pub fn claim_reward(ctx: Context<ClaimReward>, turn_id: u64, kind: ClaimKind) -> Result<()> {
        require!(
            !ctx.accounts.global_config.paused,
            IdealerError::ProtocolPaused
        );
        require!(
            kind != ClaimKind::WinnerPayout,
            IdealerError::ClaimKindMismatch
        );
        require!(
            ctx.accounts.claim.kind == kind,
            IdealerError::ClaimKindMismatch
        );
        require!(
            ctx.accounts.claim.status == ClaimState::Available,
            IdealerError::ClaimNotAvailable
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

        require!(next_turn_id >= 1, IdealerError::InvalidTurnId);

        let info = ctx.accounts.global_config.to_account_info();
        require_keys_eq!(
            *info.owner,
            crate::ID,
            IdealerError::InvalidGlobalConfigAccount
        );

        // Authenticate using only layout-stable bytes: the 8-byte discriminator
        // (offset 0) and the `authority` pubkey, which is the first field
        // (offset 8..40) in every GlobalConfig version.
        {
            let data = info.try_borrow_data()?;
            require!(
                data.len() >= 40 && &data[0..8] == GlobalConfig::DISCRIMINATOR,
                IdealerError::InvalidGlobalConfigAccount
            );
            let stored_authority = Pubkey::try_from(&data[8..40])
                .map_err(|_| error!(IdealerError::InvalidGlobalConfigAccount))?;
            require_keys_eq!(
                stored_authority,
                ctx.accounts.authority.key(),
                IdealerError::Unauthorized
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
            turn_duration_cycle: [7_200, 7_200, 28_800, 28_800],
            active_turn_duration_index: 0,
            rule_election_cutoff_bps: 7_500,
            guess_cutoff_bps: 9_670,
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
}

fn validate_live_turn(config: &GlobalConfig, turn: &TurnState) -> Result<()> {
    require!(!config.paused, IdealerError::ProtocolPaused);
    require!(config.has_active_turn, IdealerError::NoActiveTurn);
    require_eq!(
        config.active_turn_id,
        turn.turn_id,
        IdealerError::InvalidTurnId
    );
    require!(turn.status == TurnStatus::Open, IdealerError::TurnNotOpen);
    Ok(())
}

fn submit_guess_with_game_token_init(ctx: Context<SubmitGuess>, args: SubmitGuessArgs) -> Result<()> {
    let clock = Clock::get()?;
    let config = &ctx.accounts.global_config;
    validate_live_turn(config, &ctx.accounts.turn_state)?;
    validate_action_window(
        clock.unix_timestamp,
        ctx.accounts.turn_state.start_timestamp,
        ctx.accounts.turn_state.end_timestamp,
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
        &ctx.accounts.treasury_vault,
        &ctx.accounts.prize_vault,
        &ctx.accounts.system_program,
        fee_lamports,
        config.treasury_fee_bps,
    )?;
    let (treasury_amount, prize_amount) = split_fee(fee_lamports, config.treasury_fee_bps)?;

    let guess = &mut ctx.accounts.player_guess;
    guess.turn_id = ctx.accounts.turn_state.turn_id;
    guess.player = ctx.accounts.player.key();
    guess.sequence = args.sequence;
    guess.fee_lamports = fee_lamports;
    guess.numbers = args.numbers;
    guess.submitted_at = clock.unix_timestamp;
    guess.game_token = ctx.accounts.game_token.key();
    guess.verification_status = VerificationStatus::Pending;
    guess.original_rule_result = false;
    guess.alternative_rule_result = false;
    guess.claim_status = ClaimStatus::Unavailable;
    guess.bump = ctx.bumps.player_guess;

    let game_token = &mut ctx.accounts.game_token;
    game_token.turn_id = ctx.accounts.turn_state.turn_id;
    game_token.player = ctx.accounts.player.key();
    game_token.issuing_guess = guess.key();
    game_token.issued_at = clock.unix_timestamp;
    game_token.guess_count = args.sequence;
    game_token.used_for_rule_proposal_count = 0;
    game_token.used_for_vote_count = 0;
    game_token.status = GameTokenStatus::Active;
    game_token.close_authority = ctx.accounts.player.key();
    game_token.bump = ctx.bumps.game_token;

    ctx.accounts.treasury_vault.total_collected_lamports = ctx
        .accounts
        .treasury_vault
        .total_collected_lamports
        .checked_add(treasury_amount)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    ctx.accounts.prize_vault.total_collected_lamports = ctx
        .accounts
        .prize_vault
        .total_collected_lamports
        .checked_add(prize_amount)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    ctx.accounts.turn_state.prize_pool_amount_lamports = ctx
        .accounts
        .turn_state
        .prize_pool_amount_lamports
        .checked_add(prize_amount)
        .ok_or(IdealerError::ArithmeticOverflow)?;

    emit!(GuessSubmitted {
        turn_id: guess.turn_id,
        player: guess.player,
        sequence: guess.sequence,
        fee_lamports: guess.fee_lamports,
        guess: args.numbers,
        game_token: game_token.key(),
    });
    Ok(())
}

fn validate_game_token(game_token: &GameToken, turn_id: u64, player: Pubkey) -> Result<()> {
    require_eq!(game_token.turn_id, turn_id, IdealerError::InvalidGameToken);
    require_keys_eq!(game_token.player, player, IdealerError::InvalidGameToken);
    require!(
        game_token.status == GameTokenStatus::Active,
        IdealerError::InactiveGameToken
    );
    Ok(())
}

fn repeated_action_fee_lamports(base_fee_lamports: u64, turn_id: u64, sequence: u64) -> Result<u64> {
    require!(sequence > 0, IdealerError::InvalidActionSequence);

    if turn_id < VOTE_FEE_START_TURN && sequence == 1 {
        return Ok(0);
    }

    let paid_index = sequence
        .checked_sub(1)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    let mut fee = base_fee_lamports;
    for _ in 0..paid_index {
        fee = fee
            .checked_mul(REPEATED_ACTION_FEE_MULTIPLIER)
            .ok_or(IdealerError::ArithmeticOverflow)?;
    }
    Ok(fee)
}

fn collect_prize_pool_fee<'info>(
    payer: &Signer<'info>,
    prize_vault: &Account<'info, PrizeVault>,
    system_program: &Program<'info, System>,
    fee_lamports: u64,
) -> Result<()> {
    if fee_lamports == 0 {
        return Ok(());
    }

    system_program::transfer(
        CpiContext::new(
            system_program.to_account_info(),
            Transfer {
                from: payer.to_account_info(),
                to: prize_vault.to_account_info(),
            },
        ),
        fee_lamports,
    )?;
    Ok(())
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
    require!(survivor_count > 0, IdealerError::NoSurvivingFinalist);
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
    let duration = turn
        .end_timestamp
        .checked_sub(turn.start_timestamp)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    let cutoff_elapsed = i128::from(duration)
        .checked_mul(i128::from(config.rule_election_cutoff_bps))
        .ok_or(IdealerError::ArithmeticOverflow)?
        .checked_div(i128::from(BASIS_POINTS_DENOMINATOR))
        .ok_or(IdealerError::ArithmeticOverflow)?;
    let cutoff_timestamp = i128::from(turn.start_timestamp)
        .checked_add(cutoff_elapsed)
        .ok_or(IdealerError::ArithmeticOverflow)?;
    require!(
        i128::from(clock.unix_timestamp) >= cutoff_timestamp,
        IdealerError::ElectionCutoffNotReached
    );
    Ok(())
}

fn read_election_candidates<'accounts, 'info>(
    accounts: &'accounts [AccountInfo<'info>],
    turn_id: u64,
) -> Result<Vec<ElectionCandidate>> {
    let mut candidates = Vec::with_capacity(accounts.len());

    for account_info in accounts {
        require_keys_eq!(*account_info.owner, ID, IdealerError::InvalidTurnId);
        let data = account_info.try_borrow_data()?;
        let mut data_ref: &[u8] = &data;
        let proposal = RuleProposal::try_deserialize(&mut data_ref)?;
        require_eq!(proposal.turn_id, turn_id, IdealerError::InvalidTurnId);
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

fn collect_fee<'info>(
    payer: &Signer<'info>,
    treasury_vault: &Account<'info, TreasuryVault>,
    prize_vault: &Account<'info, PrizeVault>,
    system_program: &Program<'info, System>,
    fee_lamports: u64,
    treasury_fee_bps: u16,
) -> Result<()> {
    let (treasury_amount, prize_amount) = split_fee(fee_lamports, treasury_fee_bps)?;
    if treasury_amount > 0 {
        system_program::transfer(
            CpiContext::new(
                system_program.to_account_info(),
                Transfer {
                    from: payer.to_account_info(),
                    to: treasury_vault.to_account_info(),
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
        .ok_or(IdealerError::InsufficientVaultBalance)?;
    require!(
        remaining >= min_balance,
        IdealerError::InsufficientVaultBalance
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
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ IdealerError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
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
        has_one = authority @ IdealerError::Unauthorized
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
        has_one = authority @ IdealerError::Unauthorized
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
        seeds = [
            b"prize_vault".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_state.turn_id @ IdealerError::InvalidTurnId
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
        constraint = game_token.player == player.key() @ IdealerError::InvalidGameToken,
        constraint = game_token.turn_id == turn_state.turn_id @ IdealerError::InvalidGameToken
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
        seeds = [
            b"prize_vault".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_state.turn_id @ IdealerError::InvalidTurnId
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
        constraint = game_token.player == proposer.key() @ IdealerError::InvalidGameToken,
        constraint = game_token.turn_id == turn_state.turn_id @ IdealerError::InvalidGameToken
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
        seeds = [
            b"prize_vault".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_state.turn_id @ IdealerError::InvalidTurnId
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
        constraint = game_token.player == voter.key() @ IdealerError::InvalidGameToken,
        constraint = game_token.turn_id == turn_state.turn_id @ IdealerError::InvalidGameToken
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
        constraint = rule_proposal.turn_id == turn_state.turn_id @ IdealerError::InvalidTurnId
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
        constraint = game_token.player == remover.key() @ IdealerError::InvalidGameToken,
        constraint = game_token.turn_id == turn_state.turn_id @ IdealerError::InvalidGameToken
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
        constraint = rule_proposal.turn_id == turn_state.turn_id @ IdealerError::InvalidTurnId
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
        seeds = [
            b"prize_vault".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_state.turn_id @ IdealerError::InvalidTurnId
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
        constraint = game_token.player == voter.key() @ IdealerError::InvalidGameToken,
        constraint = game_token.turn_id == turn_state.turn_id @ IdealerError::InvalidGameToken
    )]
    pub game_token: Account<'info, GameToken>,
    #[account(
        seeds = [
            b"rule".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref(),
            rule_proposal.rule_id.to_le_bytes().as_ref()
        ],
        bump = rule_proposal.bump,
        constraint = rule_proposal.turn_id == turn_state.turn_id @ IdealerError::InvalidTurnId
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
    #[account(
        mut,
        seeds = [
            b"prize_vault".as_ref(),
            turn_state.turn_id.to_le_bytes().as_ref()
        ],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_state.turn_id @ IdealerError::InvalidTurnId
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
        has_one = authority @ IdealerError::Unauthorized
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
        constraint = rule_proposal.turn_id == turn_state.turn_id @ IdealerError::InvalidTurnId
    )]
    pub rule_proposal: Box<Account<'info, RuleProposal>>,
}

#[derive(Accounts)]
pub struct LockRuleElectionPool<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ IdealerError::Unauthorized
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
        has_one = authority @ IdealerError::Unauthorized
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
        has_one = authority @ IdealerError::Unauthorized
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
        has_one = authority @ IdealerError::Unauthorized
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
        has_one = authority @ IdealerError::Unauthorized
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
pub struct SettleActiveElection<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ IdealerError::Unauthorized
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
        has_one = authority @ IdealerError::Unauthorized
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
pub struct ForceSkipLegacyActiveTurn<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ IdealerError::Unauthorized
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
        has_one = authority @ IdealerError::Unauthorized
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
        has_one = authority @ IdealerError::Unauthorized
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
        has_one = authority @ IdealerError::Unauthorized
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
#[instruction(args: RecordClaimArgs)]
pub struct RecordClaim<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [b"global_config"],
        bump = global_config.bump,
        has_one = authority @ IdealerError::Unauthorized
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
        seeds = [b"turn".as_ref(), args.turn_id.to_le_bytes().as_ref()],
        bump = turn_state.bump,
        constraint = turn_state.turn_id == args.turn_id @ IdealerError::InvalidTurnId
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
        constraint = claim.claimant == claimant.key() @ IdealerError::Unauthorized,
        constraint = claim.turn_id == turn_id @ IdealerError::InvalidTurnId
    )]
    pub claim: Box<Account<'info, Claim>>,
    #[account(
        mut,
        seeds = [b"prize_vault".as_ref(), turn_id.to_le_bytes().as_ref()],
        bump = prize_vault.bump,
        constraint = prize_vault.turn_id == turn_id @ IdealerError::InvalidTurnId
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
        constraint = claim.claimant == claimant.key() @ IdealerError::Unauthorized,
        constraint = claim.turn_id == turn_id @ IdealerError::InvalidTurnId
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

#[account]
#[derive(InitSpace)]
pub struct TurnState {
    pub turn_id: u64,
    pub start_timestamp: i64,
    pub end_timestamp: i64,
    pub status: TurnStatus,
    pub prize_pool_amount_lamports: u64,
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
    pub elimination_window_start_timestamp: i64,
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
pub enum IdealerError {
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
    #[msg("The randomness account is not owned by the Switchboard On-Demand program.")]
    InvalidRandomnessOwner,
    #[msg("The randomness account does not belong to the configured VRF queue.")]
    RandomnessQueueMismatch,
    #[msg("The randomness account seed slot does not match the recorded commit slot.")]
    RandomnessCommitSlotMismatch,
    #[msg("The Switchboard randomness has not been revealed in the current slot.")]
    RandomnessNotResolved,
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
}
