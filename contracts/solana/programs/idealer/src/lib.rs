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
};

declare_id!("6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4");

pub const TURN_DURATION_CYCLE_LEN: usize = 4;
pub const MAX_RULE_TEXT_BYTES: usize = 320;
pub const BASIS_POINTS_DENOMINATOR: u16 = 10_000;

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
            max_rule_proposals_per_wallet_per_turn: args.max_rule_proposals_per_wallet_per_turn,
            max_votes_per_wallet_per_turn: args.max_votes_per_wallet_per_turn,
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
        turn.election_vrf_request = Pubkey::default();
        turn.election_vrf_fulfillment = Pubkey::default();
        turn.elected_finalist_index = 0;
        turn.draw_status = DrawStatus::NotRequested;
        turn.draw_vrf_request = Pubkey::default();
        turn.draw_vrf_fulfillment = Pubkey::default();
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

    pub fn submit_guess(ctx: Context<SubmitGuess>, numbers: [u8; 6]) -> Result<()> {
        let clock = Clock::get()?;
        let config = &ctx.accounts.global_config;
        validate_live_turn(config, &ctx.accounts.turn_state)?;
        validate_action_window(
            clock.unix_timestamp,
            ctx.accounts.turn_state.start_timestamp,
            ctx.accounts.turn_state.end_timestamp,
            config.guess_cutoff_bps,
        )?;
        validate_guess(&numbers)?;

        collect_fee(
            &ctx.accounts.player,
            &ctx.accounts.treasury_vault,
            &ctx.accounts.prize_vault,
            &ctx.accounts.system_program,
            config.guess_submission_fee_lamports,
            config.treasury_fee_bps,
        )?;
        let (treasury_amount, prize_amount) = split_fee(
            config.guess_submission_fee_lamports,
            config.treasury_fee_bps,
        )?;

        let guess = &mut ctx.accounts.player_guess;
        guess.turn_id = ctx.accounts.turn_state.turn_id;
        guess.player = ctx.accounts.player.key();
        guess.numbers = numbers;
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
            guess: numbers,
            game_token: game_token.key(),
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
        require!(
            ctx.accounts.game_token.used_for_rule_proposal_count
                < config.max_rule_proposals_per_wallet_per_turn,
            IdealerError::RuleProposalLimitReached
        );

        collect_fee(
            &ctx.accounts.proposer,
            &ctx.accounts.treasury_vault,
            &ctx.accounts.prize_vault,
            &ctx.accounts.system_program,
            config.rule_proposal_fee_lamports,
            config.treasury_fee_bps,
        )?;
        let (treasury_amount, prize_amount) =
            split_fee(config.rule_proposal_fee_lamports, config.treasury_fee_bps)?;

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

    pub fn vote_rule(ctx: Context<VoteRule>) -> Result<()> {
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
        require!(
            ctx.accounts.game_token.used_for_vote_count < config.max_votes_per_wallet_per_turn,
            IdealerError::VoteLimitReached
        );

        let vote = &mut ctx.accounts.rule_vote;
        vote.turn_id = ctx.accounts.turn_state.turn_id;
        vote.rule_id = ctx.accounts.rule_proposal.rule_id;
        vote.voter = ctx.accounts.voter.key();
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

        emit!(RuleVoteCast {
            turn_id: vote.turn_id,
            rule_id: vote.rule_id,
            voter: vote.voter,
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

    pub fn request_rule_election_vrf(
        ctx: Context<RequestRuleElectionVrf>,
        randomness_account: Pubkey,
    ) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, IdealerError::ProtocolPaused);
        require_election_cutoff_reached(config, &ctx.accounts.turn_state)?;
        require!(
            randomness_account != Pubkey::default(),
            IdealerError::InvalidRandomnessAccount
        );
        require!(
            ctx.accounts.turn_state.eligible_rule_pool_hash != [0; 32],
            IdealerError::ElectionPoolNotLocked
        );
        require!(
            ctx.accounts.turn_state.election_vrf_request == Pubkey::default(),
            IdealerError::ElectionVrfAlreadyRequested
        );

        ctx.accounts.turn_state.election_vrf_request = randomness_account;

        emit!(RuleElectionVrfRequested {
            turn_id: ctx.accounts.turn_state.turn_id,
            randomness_account,
        });
        Ok(())
    }

    pub fn settle_rule_election(
        ctx: Context<SettleRuleElection>,
        args: SettleRuleElectionArgs,
    ) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, IdealerError::ProtocolPaused);
        require_election_cutoff_reached(config, &ctx.accounts.turn_state)?;
        require!(
            ctx.accounts.turn_state.election_vrf_request != Pubkey::default(),
            IdealerError::ElectionVrfNotRequested
        );
        require!(
            args.randomness_source == ctx.accounts.turn_state.election_vrf_request,
            IdealerError::RandomnessSourceMismatch
        );

        let candidates =
            read_election_candidates(ctx.remaining_accounts, ctx.accounts.turn_state.turn_id)?;
        let result = run_rule_election(
            &candidates,
            &args.randomness,
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
        turn.election_vrf_fulfillment = args.randomness_source;
        turn.elected_finalist_index = result.elected_finalist_index;

        if let Some(active_rule_id) = result.active_rule_id {
            turn.active_rule_id = active_rule_id;
            turn.active_rule_hash = result.active_rule_hash;
            turn.frozen_rule_artifact_hash = result.active_rule_artifact_hash;
        } else {
            turn.active_rule_id = 0;
            turn.active_rule_hash = [0; 32];
            turn.frozen_rule_artifact_hash = [0; 32];
            turn.elected_finalist_index = 0;
        }

        emit!(RuleElectionSettled {
            turn_id: turn.turn_id,
            active_rule_id: turn.active_rule_id,
            elected_finalist_index: turn.elected_finalist_index,
            top_voted_finalist_hash: turn.top_voted_finalist_hash,
            random_finalist_hash: turn.random_finalist_hash,
            finalist_set_hash: turn.finalist_set_hash,
            randomness_source: args.randomness_source,
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

    /// Request a draw for a turn once it has ended. Records the verifiable
    /// randomness account that will fulfill the draw. Idempotent retries are
    /// allowed only from `NotRequested` or `Failed`.
    pub fn request_draw(ctx: Context<RequestDraw>, randomness_account: Pubkey) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, IdealerError::ProtocolPaused);
        require!(
            randomness_account != Pubkey::default(),
            IdealerError::InvalidRandomnessAccount
        );

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
        turn.draw_requested_at = clock.unix_timestamp;
        turn.draw_failure_code = 0;

        emit!(DrawRequested {
            turn_id: turn.turn_id,
            randomness_account,
            requested_at: turn.draw_requested_at,
        });
        Ok(())
    }

    /// Settle a requested draw by consuming the revealed verifiable randomness
    /// and deterministically deriving the 6 unique drawn numbers (1..=100).
    pub fn settle_draw(ctx: Context<SettleDraw>, args: SettleDrawArgs) -> Result<()> {
        let config = &ctx.accounts.global_config;
        require!(!config.paused, IdealerError::ProtocolPaused);

        let clock = Clock::get()?;
        let turn = &mut ctx.accounts.turn_state;
        require!(
            turn.draw_status == DrawStatus::Requested,
            IdealerError::DrawNotSettleable
        );
        require!(
            args.randomness != [0; 32],
            IdealerError::InvalidRandomnessValue
        );
        require!(
            args.randomness_source == turn.draw_vrf_request,
            IdealerError::RandomnessSourceMismatch
        );

        let numbers = derive_draw_numbers(&args.randomness, turn.turn_id);
        validate_guess(&numbers)?;

        turn.draw_result = numbers;
        turn.draw_randomness = args.randomness;
        turn.draw_vrf_fulfillment = args.randomness_source;
        turn.drawn_at = clock.unix_timestamp;
        turn.draw_status = DrawStatus::Fulfilled;

        emit!(DrawSettled {
            turn_id: turn.turn_id,
            draw_result: numbers,
            randomness_source: args.randomness_source,
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

fn validate_game_token(game_token: &GameToken, turn_id: u64, player: Pubkey) -> Result<()> {
    require_eq!(game_token.turn_id, turn_id, IdealerError::InvalidGameToken);
    require_keys_eq!(game_token.player, player, IdealerError::InvalidGameToken);
    require!(
        game_token.status == GameTokenStatus::Active,
        IdealerError::InactiveGameToken
    );
    Ok(())
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

fn read_election_candidates<'info>(
    accounts: &[AccountInfo<'info>],
    turn_id: u64,
) -> Result<Vec<ElectionCandidate>> {
    accounts
        .iter()
        .map(|account_info| {
            let proposal = Account::<RuleProposal>::try_from(account_info)?;
            require_eq!(proposal.turn_id, turn_id, IdealerError::InvalidTurnId);
            Ok(ElectionCandidate {
                rule_id: proposal.rule_id,
                sanitized_text_hash: proposal.sanitized_text_hash,
                compiled_artifact_hash: proposal.compiled_artifact_hash,
                vote_count: proposal.vote_count,
                report_count: proposal.report_count,
                created_at: proposal.created_at,
                is_eligible_state: proposal.state == RuleState::Eligible,
                is_precompiled_valid: proposal.precompilation_status
                    == PrecompilationStatus::Passed,
            })
        })
        .collect()
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

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeGlobalConfigArgs {
    pub treasury_address: Pubkey,
    pub draw_vrf_config: Pubkey,
    pub election_vrf_config: Pubkey,
    pub guess_submission_fee_lamports: u64,
    pub rule_proposal_fee_lamports: u64,
    pub rule_removal_fee_lamports: u64,
    pub treasury_fee_bps: u16,
    pub turn_duration_cycle: [u32; TURN_DURATION_CYCLE_LEN],
    pub rule_election_cutoff_bps: u16,
    pub guess_cutoff_bps: u16,
    pub max_rule_tokens: u16,
    pub top_voted_finalist_count: u8,
    pub random_finalist_count: u8,
    pub max_rule_proposals_per_wallet_per_turn: u16,
    pub max_votes_per_wallet_per_turn: u16,
    pub minimum_claim_threshold_lamports: u64,
    pub claim_window_turns: u16,
    pub claim_window_days: u16,
    pub creator_reward_cap_lamports: u64,
    pub min_votes_creator_self_remove: u32,
    pub min_votes_third_party_remove: u32,
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
pub struct SettleDrawArgs {
    /// The revealed verifiable randomness value (e.g. a Switchboard On-Demand
    /// randomness reveal). Stored on-chain for public reproducibility.
    pub randomness: [u8; 32],
    /// The randomness account that produced the value. Must match the account
    /// recorded by `request_draw`.
    pub randomness_source: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SettleRuleElectionArgs {
    /// The fulfilled Switchboard election randomness. This value is used for
    /// both the random finalists and final active-rule selection.
    pub randomness: [u8; 32],
    /// The randomness account that produced the value. Must match the account
    /// recorded by `request_rule_election_vrf`.
    pub randomness_source: Pubkey,
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
            player.key().as_ref()
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

#[derive(Accounts)]
pub struct VoteRule<'info> {
    #[account(mut)]
    pub voter: Signer<'info>,
    #[account(seeds = [b"global_config"], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,
    #[account(
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
            voter.key().as_ref()
        ],
        bump
    )]
    pub rule_vote: Account<'info, RuleVote>,
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
    pub treasury_fee_bps: u16,
    pub turn_duration_cycle: [u32; TURN_DURATION_CYCLE_LEN],
    pub active_turn_duration_index: u8,
    pub rule_election_cutoff_bps: u16,
    pub guess_cutoff_bps: u16,
    pub max_rule_tokens: u16,
    pub top_voted_finalist_count: u8,
    pub random_finalist_count: u8,
    pub max_rule_proposals_per_wallet_per_turn: u16,
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
    pub election_vrf_request: Pubkey,
    pub election_vrf_fulfillment: Pubkey,
    pub elected_finalist_index: u8,
    pub draw_status: DrawStatus,
    pub draw_vrf_request: Pubkey,
    pub draw_vrf_fulfillment: Pubkey,
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
    pub used_for_rule_proposal_count: u16,
    pub used_for_vote_count: u16,
    pub status: GameTokenStatus,
    pub close_authority: Pubkey,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct PlayerGuess {
    pub turn_id: u64,
    pub player: Pubkey,
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
    pub created_at: i64,
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
    Invalidated,
    Expired,
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
pub struct TurnOpened {
    pub turn_id: u64,
    pub start_timestamp: i64,
    pub end_timestamp: i64,
    pub cycle_index: u8,
}

#[event]
pub struct GuessSubmitted {
    pub turn_id: u64,
    pub player: Pubkey,
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
    #[msg("Basis points must be between 0 and 10,000.")]
    InvalidBasisPoints,
    #[msg("Election and guess cutoffs are invalid.")]
    InvalidCutoff,
    #[msg("The maximum rule token count must be positive.")]
    InvalidMaxRuleTokens,
    #[msg("At least one finalist slot is required.")]
    InvalidFinalistCounts,
    #[msg("Rate limits must be positive.")]
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
    #[msg("The Game Token reached the proposal limit for this turn.")]
    RuleProposalLimitReached,
    #[msg("The Game Token reached the vote limit for this turn.")]
    VoteLimitReached,
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
}
